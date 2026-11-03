use crate::application::usecases::pin_management_usecase::PinManagementUseCase;
use crate::domain::entities::pin::Pin;
use std::sync::Arc;
use tauri::State;

#[tauri::command]
pub async fn save_pins(
    pins: Vec<Pin>,
    pin_management_usecase: State<'_, Arc<PinManagementUseCase>>
) -> Result<(), String> {
    pin_management_usecase
        .save_pins(pins)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn load_pins(
    pin_management_usecase: State<'_, Arc<PinManagementUseCase>>
) -> Result<Vec<Pin>, String> {
    pin_management_usecase
        .load_pins()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn add_pin(
    id: f64,
    lat: f64,
    lng: f64,
    depth: f64,
    speed: f64,
    under_water_time: f64,
    mission_time: f64,
    pin_management_usecase: State<'_, Arc<PinManagementUseCase>>
) -> Result<Pin, String> {
    let pin = Pin::new(id, lat, lng, depth, speed, under_water_time, mission_time);
    pin_management_usecase
        .add_pin(pin)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_pin(
    id: f64,
    lat: f64,
    lng: f64,
    depth: f64,
    speed: f64,
    under_water_time: f64,
    mission_time: f64,
    pin_management_usecase: State<'_, Arc<PinManagementUseCase>>
) -> Result<bool, String> {
    let pin = Pin::new(id, lat, lng, depth, speed, under_water_time, mission_time);
    pin_management_usecase
        .update_pin(id, pin)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_pin(
    id: f64,
    pin_management_usecase: State<'_, Arc<PinManagementUseCase>>
) -> Result<bool, String> {
    pin_management_usecase
        .delete_pin(id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_all_pins(
    pin_management_usecase: State<'_, Arc<PinManagementUseCase>>
) -> Result<Vec<Pin>, String> {
    pin_management_usecase
        .get_all_pins()
        .await
        .map_err(|e| e.to_string())
}

// Export pins to a file in the specified format (JSON, CSV)
#[tauri::command]
pub async fn export_pins(
    file_path: String,
    format: String,
    pin_management_usecase: State<'_, Arc<PinManagementUseCase>>
) -> Result<(), String> {
    let pins = pin_management_usecase
        .load_pins()
        .await
        .map_err(|e| e.to_string())?;

    let content = match format.as_str() {
        "json" => serde_json::to_string_pretty(&pins).map_err(|e| e.to_string())?,
        "csv" => {
            let mut csv_content = "id,lat,lng,depth,speed,under_water_time,mission_time\n".to_string();
            for pin in pins {
                let line = format!(
                    "{},{},{},{},{},{},{}\n",
                    pin.id,
                    pin.lat,
                    pin.lng,
                    pin.depth,
                    pin.speed,
                    pin.under_water_time,
                    pin.mission_time,
                );
                csv_content.push_str(&line);
            }
            csv_content
        }
        _ => return Err("Unsupported format. Use 'json' or 'csv'".to_string()),
    };

    std::fs::write(file_path, content).map_err(|e| e.to_string())?;

    Ok(())
}

// Import pins from a file
#[tauri::command]
pub async fn import_pins(
    file_path: String,
    format: String,
    pin_management_usecase: State<'_, Arc<PinManagementUseCase>>
) -> Result<(), String> {
    let content = std::fs::read_to_string(file_path).map_err(|e| e.to_string())?;

    let pins: Vec<Pin> = match format.as_str() {
        "json" => serde_json::from_str(&content).map_err(|e| e.to_string())?,
        "csv" => {
            let mut pins = Vec::new();
            let mut lines = content.lines();
            let _header = lines.next();

            for line in lines {
                let parts: Vec<&str> = line.split(',').collect();
                if parts.len() >= 7 {
                    let pin = Pin {
                        id: parts[0].parse().unwrap_or(0.0),
                        lat: parts[1].parse().unwrap_or(0.0),
                        lng: parts[2].parse().unwrap_or(0.0),
                        depth: parts[3].parse().unwrap_or(0.0),
                        speed: parts[4].parse().unwrap_or(0.0),
                        under_water_time: parts[5].parse().unwrap_or(0.0),
                        mission_time: parts[6].parse().unwrap_or(0.0),
                    };
                    pins.push(pin);
                }
            }
            pins
        }
        _ => return Err("Unsupported format. Use 'json' or 'csv'".to_string()),
    };

    // Append imported pins to existing pins
    let mut existing_pins = pin_management_usecase
        .load_pins()
        .await
        .unwrap_or_else(|_| Vec::new());
    existing_pins.extend(pins);

    pin_management_usecase
        .save_pins(existing_pins)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}