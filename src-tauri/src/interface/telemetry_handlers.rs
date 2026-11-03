use crate::application::usecases::telemetry_management_usecase::TelemetryManagementUseCase;
use crate::domain::entities::telemetry::Telemetry;
use crate::interface::telemetry_export;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::State;

#[tauri::command]
pub async fn save_telemetries(
    telemetries: Vec<Telemetry>,
    telemetry_management_usecase: State<'_, Arc<TelemetryManagementUseCase>>,
) -> Result<(), String> {
    telemetry_management_usecase
        .save_telemetries(telemetries)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn load_telemetries(
    telemetry_management_usecase: State<'_, Arc<TelemetryManagementUseCase>>,
) -> Result<Vec<Telemetry>, String> {
    telemetry_management_usecase
        .load_telemetries()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_telemetry(
    timestamp: f64,
    telemetry_management_usecase: State<'_, Arc<TelemetryManagementUseCase>>,
) -> Result<bool, String> {
    telemetry_management_usecase
        .delete_telemetry(timestamp)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn clear_all_telemetries(
    telemetry_management_usecase: State<'_, Arc<TelemetryManagementUseCase>>,
) -> Result<(), String> {
    telemetry_management_usecase
        .clear_all_telemetries()
        .await
        .map_err(|e| e.to_string())
}

fn default_export_path(extension: &str) -> PathBuf {
    let dir = dirs::download_dir()
        .or_else(dirs::document_dir)
        .or_else(dirs::home_dir)
        .unwrap_or_else(|| PathBuf::from("."));

    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);

    dir.join(format!("telemetry_export_{}.{}", timestamp, extension))
}

// Export telemetry records to a file in the specified format (JSON, CSV, XLSX)
#[tauri::command]
pub async fn export_telemetries(
    file_path: Option<String>,
    format: String,
    telemetry_management_usecase: State<'_, Arc<TelemetryManagementUseCase>>,
) -> Result<String, String> {
    let telemetries = telemetry_management_usecase
        .load_telemetries()
        .await
        .map_err(|e| e.to_string())?;

    let format = format.to_lowercase();
    let extension = match format.as_str() {
        "json" | "csv" | "xlsx" => format.as_str(),
        _ => return Err("Unsupported format. Use 'json', 'csv' or 'xlsx'".to_string()),
    };

    let path = match file_path {
        Some(p) if !p.trim().is_empty() => PathBuf::from(p),
        _ => default_export_path(extension),
    };

    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    match format.as_str() {
        "xlsx" => telemetry_export::write_xlsx(&telemetries, &path)?,
        "csv" => {
            let content = telemetry_export::to_csv(&telemetries);
            std::fs::write(&path, content).map_err(|e| e.to_string())?;
        }
        _ => {
            let content = telemetry_export::to_json(&telemetries)?;
            std::fs::write(&path, content).map_err(|e| e.to_string())?;
        }
    }

    Ok(path.to_string_lossy().to_string())
}
