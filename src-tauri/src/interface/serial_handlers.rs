use crate::application::usecases::pin_management_usecase::PinManagementUseCase;
use crate::application::usecases::serial_usecase::SerialUseCase;
use crate::domain::entities::pin::Pin;
use serde::Serialize;
use std::sync::Arc;
use tauri::State;

#[derive(Serialize)]
pub struct SerialPortInfo {
    pub port_name: String,
    pub baud_rate: u32,
}

#[tauri::command]
pub async fn serial_get_port_info(
    serial_usecase: State<'_, Arc<SerialUseCase>>,
) -> Result<SerialPortInfo, String> {
    Ok(SerialPortInfo {
        port_name: serial_usecase.get_port_name(),
        baud_rate: serial_usecase.get_baud_rate(),
    })
}

#[tauri::command]
pub async fn serial_connect(
    port_name: String,
    baud_rate: u32,
    serial_usecase: State<'_, Arc<SerialUseCase>>,
) -> Result<(), String> {
    serial_usecase
        .connect(&port_name, baud_rate)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn serial_disconnect(
    serial_usecase: State<'_, Arc<SerialUseCase>>,
) -> Result<(), String> {
    serial_usecase.disconnect().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn serial_send_pins(
    pins: Vec<Pin>,
    serial_usecase: State<'_, Arc<SerialUseCase>>,
) -> Result<String, String> {
    serial_usecase
        .send_pins(pins)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn serial_is_connected(
    serial_usecase: State<'_, Arc<SerialUseCase>>,
) -> Result<bool, String> {
    Ok(serial_usecase.is_connected().await)
}

#[tauri::command]
pub async fn serial_send_start_mission(
    serial_usecase: State<'_, Arc<SerialUseCase>>,
    pin_management_usecase: State<'_, Arc<PinManagementUseCase>>,
) -> Result<Vec<u8>, String> {
    let pins = pin_management_usecase
        .get_all_pins()
        .await
        .unwrap_or_default();
    serial_usecase.send_start_mission(pins).await
}

#[tauri::command]
pub async fn serial_send_stop_mission(
    serial_usecase: State<'_, Arc<SerialUseCase>>,
) -> Result<Vec<u8>, String> {
    serial_usecase.send_stop_mission().await
}
