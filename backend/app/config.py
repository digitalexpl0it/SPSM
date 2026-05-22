from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+asyncpg://spsm:spsm_dev_change_me@localhost:5432/spsm"
    secret_key: str = "dev-secret-change-in-production"
    cors_origins: str = "http://localhost:5173"
    cors_allow_private_networks: bool = False
    portal_public_url: str = ""
    access_token_expire_minutes: int = 60 * 24 * 7  # 7 days

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
