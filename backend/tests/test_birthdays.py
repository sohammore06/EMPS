import unittest
from datetime import date

from fastapi.testclient import TestClient

from app.main import app

HR_EMAIL = "hr@intellifysolutions.com"
EMPLOYEE_EMAIL = "sohammore@intellifysolutions.com"
PASSWORD = "Password@123"


class BirthdayAdminTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def _login(self, email: str) -> str:
        response = self.client.post("/api/auth/login", json={"email": email, "password": PASSWORD})
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()["access_token"]

    def _auth(self, token: str) -> dict[str, str]:
        return {"Authorization": f"Bearer {token}"}

    def test_employee_cannot_list_or_change_birthdays(self):
        token = self._login(EMPLOYEE_EMAIL)
        listed = self.client.get("/api/birthdays/employees", headers=self._auth(token))
        self.assertEqual(listed.status_code, 403)

        month = self.client.get(
            "/api/birthdays/month",
            params={"month": 8, "year": 2026},
            headers=self._auth(token),
        )
        self.assertEqual(month.status_code, 200)
        self.assertTrue(month.json())
        user_id = month.json()[0]["id"]

        updated = self.client.put(
            f"/api/birthdays/{user_id}",
            json={"date_of_birth": "1990-01-01"},
            headers=self._auth(token),
        )
        self.assertEqual(updated.status_code, 403)

        deleted = self.client.delete(f"/api/birthdays/{user_id}", headers=self._auth(token))
        self.assertEqual(deleted.status_code, 403)

    def test_hr_can_add_update_and_clear_birthday(self):
        token = self._login(HR_EMAIL)
        employees = self.client.get("/api/birthdays/employees", headers=self._auth(token))
        self.assertEqual(employees.status_code, 200)
        hr = next(item for item in employees.json() if item["email"] == HR_EMAIL)
        user_id = hr["id"]

        created = self.client.put(
            f"/api/birthdays/{user_id}",
            json={"date_of_birth": "1995-03-15"},
            headers=self._auth(token),
        )
        self.assertEqual(created.status_code, 200, created.text)
        self.assertEqual(created.json()["date_of_birth"], "1995-03-15")

        updated = self.client.put(
            f"/api/birthdays/{user_id}",
            json={"date_of_birth": "1995-03-16"},
            headers=self._auth(token),
        )
        self.assertEqual(updated.status_code, 200, updated.text)
        self.assertEqual(updated.json()["date_of_birth"], "1995-03-16")

        future = self.client.put(
            f"/api/birthdays/{user_id}",
            json={"date_of_birth": "2099-01-01"},
            headers=self._auth(token),
        )
        self.assertEqual(future.status_code, 400)

        too_old = self.client.put(
            f"/api/birthdays/{user_id}",
            json={"date_of_birth": "1899-12-31"},
            headers=self._auth(token),
        )
        self.assertEqual(too_old.status_code, 400)

        cleared = self.client.delete(f"/api/birthdays/{user_id}", headers=self._auth(token))
        self.assertEqual(cleared.status_code, 200, cleared.text)

        employees = self.client.get("/api/birthdays/employees", headers=self._auth(token))
        hr = next(item for item in employees.json() if item["email"] == HR_EMAIL)
        self.assertIsNone(hr["date_of_birth"])

    def test_unknown_employee_returns_not_found(self):
        token = self._login(HR_EMAIL)
        response = self.client.put(
            "/api/birthdays/not-a-real-user",
            json={"date_of_birth": "1990-01-01"},
            headers=self._auth(token),
        )
        self.assertEqual(response.status_code, 404)

    def test_date_of_birth_today_is_allowed(self):
        token = self._login(HR_EMAIL)
        employees = self.client.get("/api/birthdays/employees", headers=self._auth(token))
        hr = next(item for item in employees.json() if item["email"] == HR_EMAIL)
        today = date.today().isoformat()
        response = self.client.put(
            f"/api/birthdays/{hr['id']}",
            json={"date_of_birth": today},
            headers=self._auth(token),
        )
        self.assertEqual(response.status_code, 200, response.text)
        self.client.delete(f"/api/birthdays/{hr['id']}", headers=self._auth(token))


if __name__ == "__main__":
    unittest.main()
