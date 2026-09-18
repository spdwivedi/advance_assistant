from fastapi import FastAPI, JSONResponse

app = FastAPI()

@app.get("/health")
async def health_check():
    return JSONResponse(content={"status": "healthy"})