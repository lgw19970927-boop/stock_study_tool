import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

# Test imports
try:
    from App.app import create_app
    app = create_app()
    print("FastAPI app created successfully. Route registration ok.")
    
    # Test router exists
    routes = [r.path for r in app.routes]
    if "/api/screening/pattern-recognition/stream" in routes:
        print("Success: Pattern Recognition Stream route is registered!")
    else:
        print("Error: Pattern Recognition route is missing.")
except Exception as e:
    import traceback
    traceback.print_exc()
