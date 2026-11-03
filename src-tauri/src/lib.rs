use std::sync::Arc;

use crate::application::usecases::serial_usecase::SerialUseCase;
use crate::infrastructure::serial_comm::SerialComm;

mod application;
mod domain;
mod infrastructure;
mod interface;

use crate::application::usecases::auth_usecase::AuthUseCase;
use crate::application::usecases::pin_management_usecase::PinManagementUseCase;
use crate::application::usecases::port_scan_usecase::PortScanUseCase;
use crate::application::usecases::telemetry_management_usecase::TelemetryManagementUseCase;
use crate::infrastructure::repositories::pin_repository_impl::FilePinRepository;
use crate::infrastructure::repositories::telemetry_repository_impl::FileTelemetryRepository;

// Re-export telemetry entities for easier access
pub use domain::entities::telemetry::*;

#[cfg(target_os = "linux")]
fn elevate_if_needed() {
    use std::process::{exit, Command};

    if std::env::var("REMOTE_CONTROL_ELEVATED").is_ok() {
        return;
    }

    // Check if we can access any serial port
    let has_access = crate::infrastructure::port_scanner::scan_ports()
        .iter()
        .any(|p| {
            std::fs::OpenOptions::new()
                .read(true)
                .write(true)
                .open(&p.path)
                .is_ok()
        });

    if has_access {
        return;
    }

    let exe = match std::env::current_exe() {
        Ok(exe) => exe,
        Err(_) => return,
    };

    // Collect display-relevant env vars to pass through the elevation barrier
    let env_passthrough = [
        "DISPLAY",
        "WAYLAND_DISPLAY",
        "XAUTHORITY",
        "DBUS_SESSION_BUS_ADDRESS",
        "XDG_RUNTIME_DIR",
        "HOME",
        "USER",
        "LOGNAME",
    ];

    let env_args: Vec<String> = env_passthrough
        .iter()
        .filter_map(|k| std::env::var(k).ok().map(|v| format!("{}={}", k, v)))
        .collect();

    // ── pkexec env (GUI-friendly, shows Polkit dialog) ──────────────
    //   pkexec runs /usr/bin/env, which sets the captured vars and
    //   exec's the real binary — this preserves DISPLAY etc. for GTK.
    let mut pkexec_cmd = Command::new("pkexec");
    pkexec_cmd.arg("env");
    pkexec_cmd.args(&env_args);
    pkexec_cmd.arg(&exe);
    pkexec_cmd.env("REMOTE_CONTROL_ELEVATED", "1");

    if let Ok(mut child) = pkexec_cmd.spawn() {
        let _ = child.wait();
        exit(0);
    }

    // ── sudo -E (terminal fallback) ─────────────────────────────────
    let mut sudo_cmd = Command::new("sudo");
    sudo_cmd.arg("-E").arg(&exe);
    for var in &env_passthrough {
        if let Ok(val) = std::env::var(var) {
            sudo_cmd.env(var, val);
        }
    }
    sudo_cmd.env("REMOTE_CONTROL_ELEVATED", "1");

    if let Ok(mut child) = sudo_cmd.spawn() {
        let _ = child.wait();
        exit(0);
    }

    eprintln!(
        "Warning: Cannot access serial ports. \
         Run with `sudo -E {}` or add your user to the 'dialout' group.",
        exe.display()
    );
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(target_os = "linux")]
    elevate_if_needed();

    // Create auth use case
    let auth_usecase = Arc::new(AuthUseCase::new());

    // Create infrastructure implementations
    let pin_repository = Arc::new(FilePinRepository::new());
    let telemetry_repository = Arc::new(FileTelemetryRepository::new());

    // Create application use cases
    let pin_management_usecase = Arc::new(PinManagementUseCase::new(pin_repository));
    let telemetry_management_usecase = Arc::new(TelemetryManagementUseCase::new(
        telemetry_repository.clone(),
    ));
    let port_scan_usecase = Arc::new(PortScanUseCase::new());

    // Dynamically detect available serial ports; fall back to platform default
    let detected_ports = port_scan_usecase.scan_ports();
    let default_port = detected_ports
        .first()
        .map(|p| p.path.clone())
        .unwrap_or_else(|| {
            if cfg!(target_os = "windows") {
                "COM5".into()
            } else {
                "/dev/ttyUSB0".into()
            }
        });

    // Serial comm and use case
    let serial_comm = Arc::new(SerialComm::new(&default_port, 115200));
    let serial_usecase = Arc::new(SerialUseCase::new(
        serial_comm,
        telemetry_repository.clone(),
    ));

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(auth_usecase)
        .manage(pin_management_usecase)
        .manage(telemetry_management_usecase)
        .manage(port_scan_usecase)
        .manage(serial_usecase)
        .invoke_handler(tauri::generate_handler![
            interface::auth_handlers::get_auth_state,
            interface::auth_handlers::set_password,
            interface::auth_handlers::login,
            interface::auth_handlers::logout,
            interface::auth_handlers::change_password,
            interface::auth_handlers::get_password_age_info,
            interface::auth_handlers::set_password_change_interval,
            interface::auth_handlers::is_authenticated,
            interface::pin_handlers::save_pins,
            interface::pin_handlers::load_pins,
            interface::pin_handlers::add_pin,
            interface::pin_handlers::update_pin,
            interface::pin_handlers::delete_pin,
            interface::pin_handlers::get_all_pins,
            interface::pin_handlers::export_pins,
            interface::pin_handlers::import_pins,
            interface::port_handlers::scan_ports,
            interface::telemetry_handlers::save_telemetries,
            interface::telemetry_handlers::load_telemetries,
            interface::telemetry_handlers::delete_telemetry,
            interface::telemetry_handlers::clear_all_telemetries,
            interface::telemetry_handlers::export_telemetries,
            interface::serial_handlers::serial_get_port_info,
            interface::serial_handlers::serial_connect,
            interface::serial_handlers::serial_disconnect,
            interface::serial_handlers::serial_send_pins,
            interface::serial_handlers::serial_is_connected,
            interface::serial_handlers::serial_send_start_mission,
            interface::serial_handlers::serial_send_stop_mission,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
