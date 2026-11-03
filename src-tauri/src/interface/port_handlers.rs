use crate::application::usecases::port_scan_usecase::PortScanUseCase;
use crate::infrastructure::port_scanner::PortInfo;
use std::sync::Arc;
use tauri::State;

#[tauri::command]
pub fn scan_ports(
    port_scan_usecase: State<'_, Arc<PortScanUseCase>>,
) -> Result<Vec<PortInfo>, String> {
    Ok(port_scan_usecase.scan_ports())
}
