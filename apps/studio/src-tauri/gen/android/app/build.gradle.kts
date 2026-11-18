import groovy.json.JsonOutput
import java.util.Properties
import java.util.zip.ZipFile
import javax.inject.Inject
import javax.xml.parsers.DocumentBuilderFactory
import org.gradle.api.artifacts.component.ModuleComponentIdentifier
import org.gradle.api.artifacts.result.ResolvedArtifactResult
import org.gradle.maven.MavenModule
import org.gradle.maven.MavenPomArtifact
import org.gradle.process.ExecOperations
import org.jetbrains.kotlin.gradle.dsl.JvmTarget
import org.w3c.dom.Element

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("rust")
}

val tauriProperties = Properties().apply {
    val propFile = file("tauri.properties")
    if (propFile.exists()) {
        propFile.inputStream().use { load(it) }
    }
}

android {
    compileSdk = 37
    namespace = "com.halonic.studio"
    defaultConfig {
        // Plain http:// in every build, release included: the app talks to
        // the user's own computer at an address like 192.168.1.20:4280,
        // which has no certificate. Android can't limit cleartext to the
        // home network, so the shell's connect check does (http:// only to
        // home-network addresses, after DNS), and the navigation guard lets
        // no other address load as a page in the window (HAL-1140, HAL-1375).
        manifestPlaceholders["usesCleartextTraffic"] = "true"
        applicationId = "com.halonic.studio"
        minSdk = 24
        targetSdk = 37
        versionCode = tauriProperties.getProperty("tauri.android.versionCode", "1").toInt()
        versionName = tauriProperties.getProperty("tauri.android.versionName", "1.0")
    }
    buildTypes {
        getByName("debug") {
            isDebuggable = true
            isJniDebuggable = true
            isMinifyEnabled = false
            packaging {
                jniLibs.keepDebugSymbols.add("*/arm64-v8a/*.so")
                jniLibs.keepDebugSymbols.add("*/armeabi-v7a/*.so")
                jniLibs.keepDebugSymbols.add("*/x86/*.so")
                jniLibs.keepDebugSymbols.add("*/x86_64/*.so")
            }
        }
        getByName("release") {
            optimization {
               enable = true
            }
            proguardFiles(
                *fileTree(".") {
                  include("**/*.pro")
                  exclude("build/**")
                }.files.toTypedArray()
            )
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_1_8
        targetCompatibility = JavaVersion.VERSION_1_8
    }
    buildFeatures {
        buildConfig = true
    }
}

kotlin {
    compilerOptions {
        jvmTarget = JvmTarget.JVM_1_8
    }
}

rust {
    rootDirRel = "../../../"
}

dependencies {
    implementation("androidx.webkit:webkit:1.14.0")
    implementation("androidx.appcompat:appcompat:1.7.1")
    implementation("androidx.activity:activity-ktx:1.10.1")
    implementation("com.google.android.material:material:1.12.0")
    implementation("androidx.lifecycle:lifecycle-process:2.10.0")
    testImplementation("junit:junit:4.13.2")
    androidTestImplementation("androidx.test.ext:junit:1.1.4")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.5.0")
}

apply(from = file("tauri.build.gradle.kts"))

// Third-party notices in the APK (HAL-12585). With HALONIC_THIRD_PARTY_NOTICES=1,
// as android-play.yml sets it, a release build ships assets/THIRD-PARTY-NOTICES.txt:
// our LICENSE and NOTICE, then the npm packages, the Rust crates of the three
// Android targets and the Gradle libraries, written and checked by
// `pnpm check:sbom`, which fails on a licence we don't allow. Other builds skip
// it, so a local build doesn't fetch every crate's metadata.

fun Element.children(tag: String): List<Element> =
    (0 until childNodes.length).map { childNodes.item(it) }.filterIsInstance<Element>().filter { it.tagName == tag }

fun Element.text(tag: String): String? = children(tag).firstOrNull()?.textContent?.trim()

/** The POM of a module, read without its DTD, so a POM can't pull in other files. */
fun pomOf(group: String, name: String, version: String): Element {
    val file = dependencies.createArtifactResolutionQuery()
        .forModule(group, name, version)
        .withArtifacts(MavenModule::class.java, MavenPomArtifact::class.java)
        .execute()
        .resolvedComponents
        .flatMap { it.getArtifacts(MavenPomArtifact::class.java) }
        .filterIsInstance<ResolvedArtifactResult>()
        .firstOrNull()?.file
        ?: throw GradleException("No POM found for $group:$name:$version")
    val factory = DocumentBuilderFactory.newInstance()
    factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true)
    return factory.newDocumentBuilder().parse(file).documentElement
}

/** The licences a POM names, or the nearest parent POM that names any. */
fun pomLicences(pom: Element): List<Map<String, String?>> {
    var current = pom
    for (depth in 0..5) {
        val licences = current.children("licenses").flatMap { it.children("license") }
        if (licences.isNotEmpty()) {
            return licences.map { mapOf("name" to (it.text("name") ?: ""), "url" to it.text("url")) }
        }
        val parent = current.children("parent").firstOrNull() ?: return emptyList()
        current = pomOf(parent.text("groupId") ?: "", parent.text("artifactId") ?: "", parent.text("version") ?: "")
    }
    return emptyList()
}

/** The third_party_licenses.txt Google puts at the root of its AARs, verbatim. */
fun embeddedLicences(group: String, name: String, version: String): String? {
    val aar = configurations.detachedConfiguration(dependencies.create("$group:$name:$version@aar"))
        .apply { isTransitive = false }
        .singleFile
    return ZipFile(aar).use { zip ->
        zip.getEntry("third_party_licenses.txt")?.let { entry ->
            zip.getInputStream(entry).use { it.readBytes().toString(Charsets.UTF_8) }
        }
    }
}

val gradleLicencesFile = layout.buildDirectory.file("third-party/gradle-licences.json")

tasks.register("thirdPartyLicences") {
    description = "Lists the release libraries with their POM licences and their AARs' third_party_licenses.txt."
    outputs.file(gradleLicencesFile)
    outputs.upToDateWhen { false }
    notCompatibleWithConfigurationCache("It reads POM and AAR files of the classpath while it runs.")
    doLast {
        val modules = configurations.getByName("universalReleaseRuntimeClasspath")
            .incoming.resolutionResult.allComponents
            .mapNotNull { it.id as? ModuleComponentIdentifier }
            .sortedBy { it.displayName }
        val artifacts = modules.map { module ->
            val pom = pomOf(module.group, module.module, module.version)
            mapOf(
                "group" to module.group,
                "name" to module.module,
                "version" to module.version,
                "licences" to pomLicences(pom),
                "embedded" to if (pom.text("packaging") == "aar") {
                    embeddedLicences(module.group, module.module, module.version)
                } else {
                    null
                },
            )
        }
        val json = JsonOutput.prettyPrint(JsonOutput.toJson(mapOf("artifacts" to artifacts)))
        gradleLicencesFile.get().asFile.apply { parentFile.mkdirs() }.writeText("$json\n")
    }
}

/** Runs `pnpm check:sbom` and puts the notices it writes into the release assets. */
abstract class ThirdPartyNoticesTask : DefaultTask() {
    @get:Inject
    abstract val execOperations: ExecOperations

    @get:InputFile
    abstract val gradleLicences: RegularFileProperty

    @get:Input
    abstract val appVersion: Property<String>

    @get:Internal
    abstract val repoRoot: DirectoryProperty

    @get:OutputDirectory
    abstract val assets: DirectoryProperty

    @TaskAction
    fun write() {
        val out = temporaryDir
        execOperations.exec {
            workingDir(repoRoot.get().asFile)
            commandLine(
                "pnpm", "check:sbom", "--name", "halonic-studio-android", "--version", appVersion.get(),
                "--out", out.path, "--notices", "--with-licence",
                "--gradle", gradleLicences.get().asFile.path,
                "--cargo", "apps/studio/src-tauri",
                "--cargo-target", "aarch64-linux-android",
                "--cargo-target", "armv7-linux-androideabi",
                "--cargo-target", "x86_64-linux-android",
            )
        }
        File(out, "THIRD-PARTY-NOTICES.txt")
            .copyTo(assets.get().file("THIRD-PARTY-NOTICES.txt").asFile, overwrite = true)
    }
}

if (providers.environmentVariable("HALONIC_THIRD_PARTY_NOTICES").orNull == "1") {
    val notices = tasks.register<ThirdPartyNoticesTask>("thirdPartyNotices") {
        dependsOn("thirdPartyLicences")
        gradleLicences.set(gradleLicencesFile)
        appVersion.set(android.defaultConfig.versionName ?: "0.0.0")
        // app → gen/android → src-tauri → apps/studio → the repo root.
        repoRoot.set(project.layout.projectDirectory.dir("../../../../../.."))
        outputs.upToDateWhen { false }
    }
    androidComponents.onVariants(androidComponents.selector().withBuildType("release")) { variant ->
        variant.sources.assets?.addGeneratedSourceDirectory(notices, ThirdPartyNoticesTask::assets)
    }
}
