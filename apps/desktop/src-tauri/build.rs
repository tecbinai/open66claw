use std::path::Path;

fn main() {
    // Copy standalone HTML pages (repair-assistant, screen-border) into the
    // frontendDist directory so that WebviewUrl::App(...) can resolve them.
    // These files live in src/ but Tauri resolves App URLs relative to
    // frontendDist (../../../dist/control-ui from repo root).
    let dist_dir = Path::new("_dist/dist/control-ui");
    let pages = [
        ("src/repair_assistant.html", "repair-assistant.html"),
        ("src/screen-border.html", "screen-border.html"),
    ];
    for (src, dst) in &pages {
        let src_path = Path::new(src);
        let dst_path = dist_dir.join(dst);
        if src_path.exists() && dist_dir.exists() {
            let _ = std::fs::copy(src_path, &dst_path);
            println!("cargo:rerun-if-changed={}", src);
        }
    }

    tauri_build::build()
}
