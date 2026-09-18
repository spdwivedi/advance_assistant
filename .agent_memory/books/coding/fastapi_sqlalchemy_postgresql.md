

## Operation Insight [2026-08-06 11:04:07]
```
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

app = FastAPI()

# CORS Middleware Configuration
origins = [
    "http://localhost",
    "http://localhost:3000",  # React app running on port 3000
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Database Configuration
DATABASE_URL = "postgresql+asyncpg://user:password@localhost:5432/mydatabase"
engine = create_async_engine(DATABASE_URL)
AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

# Dependency to get database session
def get_db():
    async with AsyncSessionLocal() as db:
        yield db

# Health Check Endpoint
from fastapi import APIRouter, Depends, HTTPException
health_router = APIRouter()

@health_router.get("/health", response_model=dict)
def health_check(db: AsyncSession = Depends(get_db)):
    return {"status": "healthy"}

app.include_router(health_router)

@app.get("/", response_class=Response)
def read_root(request: Request):
    return Response(content="Hello, DevPulse Orchestrator!", media_type="text/plain")
```