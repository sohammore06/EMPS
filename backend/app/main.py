from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api import attendance, auth, birthdays, dashboard, events, holidays, leave, policies, skills, users
from app.core.config import get_settings

settings = get_settings()


@asynccontextmanager
async def lifespan(_: FastAPI):
    if settings.USE_SQLITE:
        from scripts.seed import seed

        seed()
    yield


app = FastAPI(
    title="EPMS HRMS API",
    version="1.0.0",
    description="Employee Self-Service, Attendance, and Leave Management",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

upload_path = Path(settings.UPLOAD_DIR)
upload_path.mkdir(parents=True, exist_ok=True)
(upload_path / "policies").mkdir(exist_ok=True)
(upload_path / "certifications").mkdir(exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(upload_path)), name="uploads")

api_prefix = "/api"
app.include_router(auth.router, prefix=api_prefix)
app.include_router(users.router, prefix=api_prefix)
app.include_router(attendance.router, prefix=api_prefix)
app.include_router(leave.router, prefix=api_prefix)
app.include_router(birthdays.router, prefix=api_prefix)
app.include_router(events.router, prefix=api_prefix)
app.include_router(holidays.router, prefix=api_prefix)
app.include_router(skills.router, prefix=api_prefix)
app.include_router(policies.router, prefix=api_prefix)
app.include_router(dashboard.router, prefix=api_prefix)


@app.get("/health")
def health():
    return {
        "status": "ok",
        "database": "sqlite" if settings.USE_SQLITE else "mssql",
    }
