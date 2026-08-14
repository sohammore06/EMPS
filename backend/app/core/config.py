from functools import lru_cache
from urllib.parse import quote_plus

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # When true, uses local SQLite for demo login without SQL Server
    USE_SQLITE: bool = False
    SQLITE_PATH: str = "./epms_local.db"

    DATABASE_URL: str = (
        "mssql+pyodbc://sa:YOUR_PASSWORD@localhost/EPMS"
        "?driver=ODBC+Driver+18+for+SQL+Server&TrustServerCertificate=yes"
    )

    # Prefer these (same as existing EPMS apps) when set
    MSSQL_SERVER: str = ""
    MSSQL_DATABASE: str = "EPMS"
    MSSQL_USERNAME: str = "sa"
    MSSQL_PASSWORD: str = ""
    MSSQL_DRIVER: str = "ODBC Driver 18 for SQL Server"

    SECRET_KEY: str = "change-this-secret-key-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    AZURE_CLIENT_ID: str = ""
    AZURE_TENANT_ID: str = ""
    AZURE_CLIENT_SECRET: str = ""

    UPLOAD_DIR: str = "uploads"
    CORS_ORIGINS: str = "http://localhost:3000"

    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM: str = "noreply@intellifysolutions.com"

    @property
    def resolved_database_url(self) -> str:
        if self.USE_SQLITE:
            return f"sqlite:///{self.SQLITE_PATH}"
        if self.MSSQL_SERVER and self.MSSQL_PASSWORD:
            odbc_connect = (
                f"DRIVER={{{self.MSSQL_DRIVER}}};"
                f"SERVER={self.MSSQL_SERVER};"
                f"DATABASE={self.MSSQL_DATABASE};"
                f"UID={self.MSSQL_USERNAME};"
                f"PWD={self.MSSQL_PASSWORD};"
                f"TrustServerCertificate=yes;"
            )
            return f"mssql+pyodbc:///?odbc_connect={quote_plus(odbc_connect)}"
        return self.DATABASE_URL

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    @property
    def azure_authority(self) -> str:
        return f"https://login.microsoftonline.com/{self.AZURE_TENANT_ID}"

    @property
    def azure_jwks_uri(self) -> str:
        return f"{self.azure_authority}/discovery/v2.0/keys"


@lru_cache
def get_settings() -> Settings:
    return Settings()
