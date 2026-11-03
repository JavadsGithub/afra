use crate::application::usecases::auth_usecase::AuthUseCase;
use crate::domain::entities::auth::{AuthState, PasswordAgeInfo};
use std::sync::Arc;
use tauri::State;

#[tauri::command]
pub async fn get_auth_state(
    auth_usecase: State<'_, Arc<AuthUseCase>>,
) -> Result<AuthState, String> {
    auth_usecase.get_auth_state().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn set_password(
    password: &str,
    auth_usecase: State<'_, Arc<AuthUseCase>>,
) -> Result<(), String> {
    auth_usecase.set_password(password).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn login(
    password: &str,
    auth_usecase: State<'_, Arc<AuthUseCase>>,
) -> Result<bool, String> {
    auth_usecase.login(password).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn logout(
    auth_usecase: State<'_, Arc<AuthUseCase>>,
) -> Result<(), String> {
    auth_usecase.logout();
    Ok(())
}

#[tauri::command]
pub async fn change_password(
    old_password: &str,
    new_password: &str,
    auth_usecase: State<'_, Arc<AuthUseCase>>,
) -> Result<(), String> {
    auth_usecase
        .change_password(old_password, new_password)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_password_age_info(
    auth_usecase: State<'_, Arc<AuthUseCase>>,
) -> Result<PasswordAgeInfo, String> {
    auth_usecase.get_password_age_info().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn set_password_change_interval(
    days: u32,
    auth_usecase: State<'_, Arc<AuthUseCase>>,
) -> Result<(), String> {
    auth_usecase
        .set_password_change_interval(days)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn is_authenticated(
    auth_usecase: State<'_, Arc<AuthUseCase>>,
) -> Result<bool, String> {
    Ok(auth_usecase.is_authenticated())
}
