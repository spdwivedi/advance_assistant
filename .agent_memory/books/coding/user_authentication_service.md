

## Operation Insight [2026-08-06 13:32:34]
## User Authentication Service Implementation Overview

The User Authentication Service is a critical component of the DevPulse Orchestrator, handling user registration, login, and logout functionalities. Below are detailed code snippets for the service implementation.

### User Model (models.py)
```python
from sqlalchemy import Column, Integer, String
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship
from werkzeug.security import generate_password_hash, check_password_hash

Base = declarative_base()

class User(Base):
    __tablename__ = 'users'
    id = Column(Integer, primary_key=True)
    username = Column(String(80), unique=True, nullable=False)
    email = Column(String(120), unique=True, nullable=False)
    password_hash = Column(String(120))
    session_token = Column(String(120))

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)
```

### Authentication Service (auth_service.py)
```python
from sqlalchemy.orm import Session
from models import User

def register_user(db: Session, username: str, email: str, password: str) -> User:
    existing_user = db.query(User).filter_by(username=username).first()
    if existing_user:
        raise ValueError("Username already exists")

    new_user = User(username=username, email=email)
    new_user.set_password(password)
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user

def authenticate_user(db: Session, username: str, password: str) -> User:
    user = db.query(User).filter_by(username=username).first()
    if user and user.check_password(password):
        return user
    raise ValueError("Invalid credentials")

def logout_user(db: Session, session_token: str) -> None:
    user = db.query(User).filter_by(session_token=session_token).first()
    if user:
        user.session_token = None
        db.commit()
```

### Example Usage (main.py)
```python
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from models import Base, User
from auth_service import register_user, authenticate_user, logout_user

# Database setup
engine = create_engine('sqlite:///example.db')
Base.metadata.create_all(engine)
db = sessionmaker(bind=engine)()

# Register a new user
new_user = register_user(db, 'john_doe', 'john@example.com', 'password123')

# Authenticate the user
authenticated_user = authenticate_user(db, 'john_doe', 'password123')

# Logout the user
logout_user(db, authenticated_user.session_token)
```