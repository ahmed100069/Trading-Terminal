from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import models  # noqa: F401
from app.api.router import api_router
from app.core.config import settings
from app.core.database import create_database

app = FastAPI(
    title=settings.project_name,
    version="1.0.0",
    description="A Binance-powered crypto strategy terminal built for learning, demos, and academic evaluation.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup() -> None:
    create_database()


app.include_router(api_router, prefix=settings.api_prefix)

