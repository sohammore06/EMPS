import unittest

from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import app


class CorsOriginsTests(unittest.TestCase):
    def test_localhost_alias_includes_loopback(self):
        settings = Settings(CORS_ORIGINS="http://localhost:3000")
        self.assertIn("http://localhost:3000", settings.cors_origins_list)
        self.assertIn("http://127.0.0.1:3000", settings.cors_origins_list)

    def test_loopback_alias_includes_localhost(self):
        settings = Settings(CORS_ORIGINS="http://127.0.0.1:3000")
        self.assertIn("http://127.0.0.1:3000", settings.cors_origins_list)
        self.assertIn("http://localhost:3000", settings.cors_origins_list)

    def test_preflight_allows_127_origin(self):
        client = TestClient(app)
        response = client.options(
            "/api/auth/login",
            headers={
                "Origin": "http://127.0.0.1:3000",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type",
            },
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers.get("access-control-allow-origin"), "http://127.0.0.1:3000")


if __name__ == "__main__":
    unittest.main()
