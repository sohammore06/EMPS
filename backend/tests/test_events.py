import unittest
from datetime import date

from fastapi.testclient import TestClient

from app.main import app
from app.utils.helpers import years_elapsed

HR_EMAIL = "hr@intellifysolutions.com"
EMPLOYEE_EMAIL = "sohammore@intellifysolutions.com"
PASSWORD = "Password@123"


class YearsElapsedTests(unittest.TestCase):
    def test_same_year_is_zero(self):
        self.assertEqual(years_elapsed(date(2026, 8, 14), date(2026, 8, 14)), 0)

    def test_completed_years(self):
        self.assertEqual(years_elapsed(date(2022, 8, 20), date(2026, 8, 20)), 4)


class EventPlannerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def _login(self, email: str) -> str:
        response = self.client.post("/api/auth/login", json={"email": email, "password": PASSWORD})
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()["access_token"]

    def _auth(self, token: str) -> dict[str, str]:
        return {"Authorization": f"Bearer {token}"}

    def test_employee_can_view_but_not_manage_events(self):
        token = self._login(EMPLOYEE_EMAIL)
        month = self.client.get(
            "/api/events/month",
            params={"month": 8, "year": 2026},
            headers=self._auth(token),
        )
        self.assertEqual(month.status_code, 200)
        types = {item["event_type"] for item in month.json()}
        self.assertIn("BIRTHDAY", types)
        self.assertIn("WORK_ANNIVERSARY", types)

        listed = self.client.get("/api/events/employees", headers=self._auth(token))
        self.assertEqual(listed.status_code, 403)

        user_id = next(item["user_id"] for item in month.json() if item["email"] == EMPLOYEE_EMAIL)
        updated = self.client.put(
            f"/api/events/{user_id}",
            json={"event_type": "WORK_ANNIVERSARY", "event_date": "2021-01-01"},
            headers=self._auth(token),
        )
        self.assertEqual(updated.status_code, 403)

    def test_month_can_filter_by_event_type(self):
        token = self._login(HR_EMAIL)
        birthdays = self.client.get(
            "/api/events/month",
            params={"month": 8, "year": 2026, "event_type": "BIRTHDAY"},
            headers=self._auth(token),
        )
        self.assertEqual(birthdays.status_code, 200)
        self.assertTrue(birthdays.json())
        self.assertTrue(all(item["event_type"] == "BIRTHDAY" for item in birthdays.json()))

        anniversaries = self.client.get(
            "/api/events/month",
            params={"month": 8, "year": 2026, "event_type": "WORK_ANNIVERSARY"},
            headers=self._auth(token),
        )
        self.assertEqual(anniversaries.status_code, 200)
        self.assertTrue(anniversaries.json())
        self.assertTrue(all(item["event_type"] == "WORK_ANNIVERSARY" for item in anniversaries.json()))

    def test_hr_can_add_update_and_clear_work_anniversary(self):
        token = self._login(HR_EMAIL)
        employees = self.client.get("/api/events/employees", headers=self._auth(token))
        self.assertEqual(employees.status_code, 200)
        hr = next(item for item in employees.json() if item["email"] == HR_EMAIL)

        created = self.client.put(
            f"/api/events/{hr['id']}",
            json={"event_type": "BIRTHDAY", "event_date": "1991-04-02"},
            headers=self._auth(token),
        )
        self.assertEqual(created.status_code, 200, created.text)
        self.assertEqual(created.json()["event_type"], "BIRTHDAY")
        self.assertEqual(created.json()["event_date"], "1991-04-02")

        updated = self.client.put(
            f"/api/events/{hr['id']}",
            json={"event_type": "WORK_ANNIVERSARY", "event_date": "2019-11-05"},
            headers=self._auth(token),
        )
        self.assertEqual(updated.status_code, 200, updated.text)
        self.assertEqual(updated.json()["event_type"], "WORK_ANNIVERSARY")
        self.assertEqual(updated.json()["event_date"], "2019-11-05")

        future = self.client.put(
            f"/api/events/{hr['id']}",
            json={"event_type": "WORK_ANNIVERSARY", "event_date": "2099-01-01"},
            headers=self._auth(token),
        )
        self.assertEqual(future.status_code, 400)

        cleared = self.client.delete(
            f"/api/events/{hr['id']}",
            params={"event_type": "BIRTHDAY"},
            headers=self._auth(token),
        )
        self.assertEqual(cleared.status_code, 200, cleared.text)

        # restore a joining date so later seed/UI still has an anniversary
        self.client.put(
            f"/api/events/{hr['id']}",
            json={"event_type": "WORK_ANNIVERSARY", "event_date": "2020-03-10"},
            headers=self._auth(token),
        )

    def test_unknown_employee_returns_not_found(self):
        token = self._login(HR_EMAIL)
        response = self.client.put(
            "/api/events/not-a-real-user",
            json={"event_type": "BIRTHDAY", "event_date": "1990-01-01"},
            headers=self._auth(token),
        )
        self.assertEqual(response.status_code, 404)


if __name__ == "__main__":
    unittest.main()
