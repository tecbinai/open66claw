use tauri::image::Image;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder};
use tauri::{App, Manager, WebviewUrl, WebviewWindowBuilder};

use crate::{platform, sidecar};

/// Stored tray state for lifecycle management and dynamic menu control.
pub struct TrayState {
    /// Keep TrayIcon alive for the entire app lifetime.
    /// Dropping it would remove the icon from the system tray.
    pub _icon: TrayIcon,
    pub start_service: MenuItem<tauri::Wry>,
    pub stop_service: MenuItem<tauri::Wry>,
    pub restart_service: MenuItem<tauri::Wry>,
}

/// Update tray menu items enabled state based on whether the service is running.
pub fn update_tray_menu_state(app: &tauri::AppHandle) {
    let running = sidecar::is_sidecar_running();
    if let Some(state) = app.try_state::<TrayState>() {
        let _ = state.start_service.set_enabled(!running);
        let _ = state.stop_service.set_enabled(running);
        let _ = state.restart_service.set_enabled(running);
    }
}

/// Show an error message to the user via the WebView alert dialog.
/// Ensures the window is visible first (user may have hidden it to tray).
fn show_tray_error(app: &tauri::AppHandle, msg: &str) {
    eprintln!("[Tray] {}", msg);
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
        let escaped = msg
            .replace('\\', "\\\\")
            .replace('\'', "\\'")
            .replace('\n', "\\n")
            .replace('\r', "");
        let _ = window.eval(&format!("alert('{}')", escaped));
    }
}

/// Open the repair assistant in a dedicated window.
/// If the window already exists, focus it instead of creating a new one.
fn open_repair_assistant(app: &tauri::AppHandle) {
    // Re-use existing window if already open
    if let Some(window) = app.get_webview_window("repair-assistant") {
        let _ = window.show();
        let _ = window.set_focus();
        return;
    }

    // repair-assistant.html is copied into frontendDist by build.rs so
    // WebviewUrl::App can resolve it correctly.
    match WebviewWindowBuilder::new(
        app,
        "repair-assistant",
        WebviewUrl::App("repair-assistant.html".into()),
    )
    .title("OpenClawCN 检修助手")
    .inner_size(960.0, 640.0)
    .resizable(true)
    .center()
    .visible(true)
    .build()
    {
        Ok(_) => {}
        Err(e) => {
            show_tray_error(app, &format!("打开检修助手失败: {}", e));
        }
    }
}

pub fn setup_tray(app: &mut App) -> Result<(), Box<dyn std::error::Error>> {
    let start_item =
        MenuItem::with_id(app, "start_service", "▶ 启动服务", true, None::<&str>)?;
    let stop_item =
        MenuItem::with_id(app, "stop_service", "⏸ 停止服务", false, None::<&str>)?;
    let restart_item =
        MenuItem::with_id(app, "restart_service", "🔄 重启服务", false, None::<&str>)?;

    let menu = Menu::with_items(
        app,
        &[
            &MenuItem::with_id(app, "show", "显示主窗口", true, None::<&str>)?,
            &MenuItem::with_id(app, "hide", "隐藏到托盘", true, None::<&str>)?,
            &MenuItem::new(app, "───", false, None::<&str>)?,
            &start_item,
            &stop_item,
            &restart_item,
            &MenuItem::new(app, "───", false, None::<&str>)?,
            &MenuItem::with_id(app, "open_logs", "📁 查看日志", true, None::<&str>)?,
            &MenuItem::with_id(app, "repair_assistant", "🔧 一键检修", true, None::<&str>)?,
            &MenuItem::new(app, "───", false, None::<&str>)?,
            &MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?,
        ],
    )?;

    // Use a dedicated 44x44 tray icon (black on transparent) for macOS menu bar.
    // The tray-icon crate auto-scales to 18pt height for the menu bar.
    // icon_as_template adapts the icon to light/dark menu bar automatically.
    println!("[Tray] Loading icon, thread={:?}", std::thread::current().name());
    let tray_image = Image::from_bytes(include_bytes!("../icons/44x44.png"))
        .expect("failed to load tray icon 44x44.png");

    println!("[Tray] Building tray icon...");
    let tray_icon = TrayIconBuilder::new()
        .menu(&menu)
        .tooltip("66Claw")
        .icon(tray_image)
        .icon_as_template(false)
        .title("66")
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            "hide" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.hide();
                }
            }
            "start_service" => {
                let handle = app.app_handle().clone();
                std::thread::spawn(move || {
                    match sidecar::start_sidecar(handle.clone()) {
                        Ok(()) => {
                            println!("[Tray] Service started");
                        }
                        Err(e) => {
                            show_tray_error(&handle, &format!("启动服务失败: {}", e));
                        }
                    }
                    update_tray_menu_state(&handle);
                });
            }
            "stop_service" => {
                let handle = app.app_handle().clone();
                std::thread::spawn(move || {
                    match sidecar::stop_sidecar() {
                        Ok(()) => {
                            println!("[Tray] Service stopped");
                        }
                        Err(e) => {
                            show_tray_error(&handle, &format!("停止服务失败: {}", e));
                        }
                    }
                    update_tray_menu_state(&handle);
                });
            }
            "restart_service" => {
                let handle = app.app_handle().clone();
                std::thread::spawn(move || {
                    match sidecar::restart_sidecar(handle.clone()) {
                        Ok(()) => {
                            println!("[Tray] Service restarted");
                        }
                        Err(e) => {
                            show_tray_error(&handle, &format!("重启服务失败: {}", e));
                        }
                    }
                    update_tray_menu_state(&handle);
                });
            }
            "open_logs" => {
                match sidecar::log_file_path() {
                    Ok(log_path) => {
                        if let Err(e) = platform::open_file_in_explorer(&log_path) {
                            show_tray_error(app, &format!("打开日志文件失败: {}", e));
                        }
                    }
                    Err(e) => {
                        show_tray_error(app, &format!("获取日志路径失败: {}", e));
                    }
                }
            }
            "repair_assistant" => {
                open_repair_assistant(app);
            }
            "quit" => {
                sidecar::cleanup_on_exit();
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let tauri::tray::TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                if let Some(window) = tray.app_handle().get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
        })
        .build(app)?;

    // Workaround for tray-icon crate bug: during initialization,
    // NSImage.setTemplate() is called AFTER button.setImage() without
    // re-setting the image, so the template flag never takes visual effect.
    // Re-set the icon and template mode to force proper rendering.
    let icon_refresh = Image::from_bytes(include_bytes!("../icons/44x44.png"))
        .expect("failed to reload tray icon");
    match tray_icon.set_icon(Some(icon_refresh)) {
        Ok(()) => println!("[Tray] Icon re-set OK"),
        Err(e) => println!("[Tray] Icon re-set FAILED: {:?}", e),
    }
    match tray_icon.set_icon_as_template(false) {
        Ok(()) => println!("[Tray] Template re-set OK"),
        Err(e) => println!("[Tray] Template re-set FAILED: {:?}", e),
    }

    println!("[Tray] Tray icon created successfully, id={:?}", tray_icon.id());

    // Store TrayIcon + menu item handles in app state.
    // TrayIcon must live as long as the app — dropping it removes the tray icon.
    app.manage(TrayState {
        _icon: tray_icon,
        start_service: start_item,
        stop_service: stop_item,
        restart_service: restart_item,
    });

    Ok(())
}
