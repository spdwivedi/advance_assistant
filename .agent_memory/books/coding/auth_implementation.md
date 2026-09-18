

## Operation Insight [2026-08-06 11:07:07]
```python
# Role-based authorization decorator
def requires_role(role):
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            token = request.headers.get('Authorization')
            if not token:
                abort(401)
            try:
                payload = jwt.decode(token, app.config['SECRET_KEY'], algorithms=['HS256'])
                user_id = payload['user_id']
                user_role = payload['role']
                if role == 'Any' or user_role in role.split(','):
                    return f(*args, **kwargs)
                else:
                    abort(403)
            except jwt.ExpiredSignatureError:
                abort(401)
            except jwt.InvalidTokenError:
                abort
```