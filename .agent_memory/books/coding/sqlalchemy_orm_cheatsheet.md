

## Operation Insight [2026-08-06 13:22:15]
```markdown
### SQLAlchemy ORM Cheatsheet

#### Entities
- **User**: Represents a user with attributes for `id`, `username`, `email`, and `password`.
- **Post**: Represents a post with attributes for `id`, `title`, `content`, and `user_id`. It has a relationship with the `User` entity.
- **Comment**: Represents a comment with attributes for `id`, `text`, and `post_id`. It has a relationship with the `Post` entity.

#### Relationships
- Each `Post` is associated with one `User` via the `author` relationship.
- Each `Post` can have multiple `Comments` via the `comments` relationship.

```python
class User(Base):
    __tablename__ = 'users'
    id = Column(Integer, primary_key=True)
    username = Column(String, unique=True, nullable=False)
    email = Column(String, unique=True, nullable=False)
    password = Column(String, nullable=False)

class Post(Base):
    __tablename__ = 'posts'
    id = Column(Integer, primary_key=True)
    title = Column(String, nullable=False)
    content = Column(String, nullable=False)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    author = relationship("User", backref=backref("posts", lazy="dynamic"))

class Comment(Base):
    __tablename__ = 'comments'
    id = Column(Integer, primary_key=True)
    text = Column(String, nullable=False)
    post_id = Column(Integer, ForeignKey('posts.id'), nullable=False)
    post = relationship("Post", back_populates="comments")
```