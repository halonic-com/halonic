import groovy.json.JsonOutput
import java.io.InputStream
import java.util.Properties
import java.util.zip.ZipFile
import java.util.zip.ZipInputStream
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

/** The AAR of a module. It must exist: the POM says the module is one. */
fun aarOf(group: String, name: String, version: String): File =
    configurations.detachedConfiguration(dependencies.create("$group:$name:$version@aar"))
        .apply { isTransitive = false }
        .singleFile

/**
 * The JAR of a module, or null when it has none. A Kotlin Multiplatform root
 * module may publish no JAR of its own: its code is in the `-jvm` or
 * `-android` module, which the classpath lists too.
 */
fun jarOf(group: String, name: String, version: String): File? =
    configurations.detachedConfiguration(dependencies.create("$group:$name:$version@jar"))
        .apply { isTransitive = false }
        .incoming.artifactView { lenient(true) }.files.singleOrNull()

/** The third_party_licenses.txt Google puts at the root of its AARs, verbatim. */
fun embeddedLicences(aar: File): String? =
    ZipFile(aar).use { zip ->
        zip.getEntry("third_party_licenses.txt")?.let { entry ->
            zip.getInputStream(entry).use { it.readBytes().toString(Charsets.UTF_8) }
        }
    }

val noticeEntry = Regex("^META-INF/NOTICE[^/]*$", RegexOption.IGNORE_CASE)

/**
 * The META-INF/NOTICE files of a JAR, sorted by name. Apache-2.0 section 4(d)
 * asks us to pass on a library's NOTICE file with it (HAL-12776).
 */
fun jarNotices(jar: InputStream): List<String> {
    val found = sortedMapOf<String, String>()
    ZipInputStream(jar).use { zip ->
        generateSequence { zip.nextEntry }
            .filter { noticeEntry.matches(it.name) }
            .forEach { found[it.name] = zip.readBytes().toString(Charsets.UTF_8) }
    }
    return found.values.toList()
}

/** The NOTICE files of an AAR: those of the classes.jar inside it. */
fun aarNotices(aar: File): List<String> =
    ZipFile(aar).use { zip ->
        zip.getEntry("classes.jar")?.let { jarNotices(zip.getInputStream(it)) } ?: emptyList()
    }

/** What the Gradle licence file says about one module, or null for a module that ships no code. */
fun licenceEntry(module: ModuleComponentIdentifier): Map<String, Any?>? {
    val pom = pomOf(module.group, module.module, module.version)
    val packaging = pom.text("packaging") ?: "jar"
    // A BOM (packaging "pom") only pins versions: no artifact, nothing shipped.
    if (packaging == "pom") {
        return null
    }
    val aar = if (packaging == "aar") aarOf(module.group, module.module, module.version) else null
    val jar = if (aar == null) jarOf(module.group, module.module, module.version) else null
    if (aar == null && jar == null) {
        logger.warn("thirdPartyLicences: ${module.displayName} has no JAR, so no NOTICE file was read")
    }
    return mapOf(
        "group" to module.group,
        "name" to module.module,
        "version" to module.version,
        "licences" to pomLicences(pom),
        "embedded" to aar?.let { embeddedLicences(it) },
        "notices" to (aar?.let { aarNotices(it) } ?: jar?.inputStream()?.let { jarNotices(it) } ?: emptyList()),
    )
}

val gradleLicencesFile = layout.buildDirectory.file("third-party/gradle-licences.json")

tasks.register("thirdPartyLicences") {
    description = "Lists the release libraries with their POM licences, their AARs' third_party_licenses.txt and their NOTICE files."
    outputs.file(gradleLicencesFile)
    outputs.upToDateWhen { false }
    notCompatibleWithConfigurationCache("It reads POM, AAR and JAR files of the classpath while it runs.")
    doLast {
        val modules = configurations.getByName("universalReleaseRuntimeClasspath")
            .incoming.resolutionResult.allComponents
            .mapNotNull { it.id as? ModuleComponentIdentifier }
            .sortedBy { it.displayName }
        val artifacts = modules.mapNotNull { licenceEntry(it) }
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
