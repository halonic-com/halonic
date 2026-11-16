use std::fs;

use serde_json::json;

use super::report_for;

#[test]
fn the_report_has_the_shape_the_page_reads() {
    let folder = std::env::temp_dir().join(format!("resource-report-{}", std::process::id()));
    let _ = fs::remove_dir_all(&folder);
    fs::create_dir_all(&folder).unwrap();
    fs::write(folder.join("run.log"), [0u8; 42]).unwrap();

    let report = serde_json::to_value(report_for(&folder).unwrap()).unwrap();
    fs::remove_dir_all(&folder).unwrap();

    assert_eq!(report["dataBytes"], 42);
    assert_eq!(report["childProcesses"], json!([]));
    assert!(report["engineMemoryBytes"].as_u64().unwrap() > 0);
    assert!(report["freeDiskBytes"].as_u64().unwrap() > 0);
    // Not known is left out, never an empty list.
    assert!(report.get("loadedModels").is_none());
}

#[test]
fn a_profile_with_no_folder_yet_has_no_data() {
    let folder = std::env::temp_dir()
        .join(format!("resource-report-absent-{}", std::process::id()))
        .join("profile");
    let report = serde_json::to_value(report_for(&folder).unwrap()).unwrap();
    assert_eq!(report["dataBytes"], 0);
    assert!(report["freeDiskBytes"].as_u64().unwrap() > 0);
}
