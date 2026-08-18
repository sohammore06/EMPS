import unittest
from datetime import date
from decimal import Decimal

from fastapi.testclient import TestClient

from app.main import app
from app.utils.helpers import leave_days

HR_EMAIL = "hr@intellifysolutions.com"
EMPLOYEE_EMAIL = "sohammore@intellifysolutions.com"
PASSWORD = "Password@123"


class LeaveDaysPolicyTests(unittest.TestCase):
    def test_friday_to_tuesday_skips_weekend_and_monday_holiday(self):
        days = leave_days(
            date(2026, 8, 14),
            date(2026, 8, 18),
            False,
            holiday_dates={date(2026, 8, 17)},
            count_weekends=False,
            count_holidays=False,
            weekend_days={5, 6},
        )
        self.assertEqual(days, Decimal("2"))

    def test_half_day_on_holiday_is_zero_when_holidays_excluded(self):
        days = leave_days(
            date(2026, 8, 17),
            date(2026, 8, 17),
            True,
            holiday_dates={date(2026, 8, 17)},
            count_weekends=False,
            count_holidays=False,
        )
        self.assertEqual(days, Decimal("0"))

    def test_legacy_call_still_counts_all_calendar_days(self):
        days = leave_days(date(2026, 8, 14), date(2026, 8, 18), False)
        self.assertEqual(days, Decimal("5"))


class HolidayApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def _login(self, email: str) -> str:
        response = self.client.post("/api/auth/login", json={"email": email, "password": PASSWORD})
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()["access_token"]

    def _auth(self, token: str) -> dict[str, str]:
        return {"Authorization": f"Bearer {token}"}

    def test_employee_can_view_but_not_manage(self):
        token = self._login(EMPLOYEE_EMAIL)
        listed = self.client.get("/api/holidays", params={"year": 2026}, headers=self._auth(token))
        self.assertEqual(listed.status_code, 200)
        self.assertTrue(listed.json())

        created = self.client.post(
            "/api/holidays",
            json={"holiday_date": "2026-09-01", "holiday_name": "Test", "holiday_type": "COMPANY"},
            headers=self._auth(token),
        )
        self.assertEqual(created.status_code, 403)

    def test_hr_can_add_update_and_delete_holiday(self):
        token = self._login(HR_EMAIL)
        created = self.client.post(
            "/api/holidays",
            json={"holiday_date": "2026-09-16", "holiday_name": "Founders Day", "holiday_type": "company"},
            headers=self._auth(token),
        )
        self.assertEqual(created.status_code, 201, created.text)
        body = created.json()
        self.assertEqual(body["holiday_type"], "COMPANY")
        self.assertEqual(body["holiday_name"], "Founders Day")
        self.assertIsNotNone(body["created_date"])
        holiday_id = body["holiday_id"]

        duplicate = self.client.post(
            "/api/holidays",
            json={"holiday_date": "2026-09-16", "holiday_name": "Another", "holiday_type": "PUBLIC"},
            headers=self._auth(token),
        )
        self.assertEqual(duplicate.status_code, 400)

        updated = self.client.put(
            f"/api/holidays/{holiday_id}",
            json={"holiday_name": "Founders' Day", "holiday_type": "FESTIVAL"},
            headers=self._auth(token),
        )
        self.assertEqual(updated.status_code, 200, updated.text)
        self.assertEqual(updated.json()["holiday_name"], "Founders' Day")
        self.assertEqual(updated.json()["holiday_type"], "FESTIVAL")

        deleted = self.client.delete(f"/api/holidays/{holiday_id}", headers=self._auth(token))
        self.assertEqual(deleted.status_code, 200, deleted.text)

        missing = self.client.get(f"/api/holidays/{holiday_id}", headers=self._auth(token))
        self.assertEqual(missing.status_code, 404)

    def test_invalid_type_is_rejected(self):
        token = self._login(HR_EMAIL)
        response = self.client.post(
            "/api/holidays",
            json={"holiday_date": "2026-09-20", "holiday_name": "Bad Type", "holiday_type": "UNKNOWN"},
            headers=self._auth(token),
        )
        self.assertEqual(response.status_code, 400)

    def test_leave_apply_uses_holiday_and_weekend_policy(self):
        hr_token = self._login(HR_EMAIL)
        created = self.client.post(
            "/api/holidays",
            json={"holiday_date": "2027-01-11", "holiday_name": "Company Off", "holiday_type": "COMPANY"},
            headers=self._auth(hr_token),
        )
        self.assertEqual(created.status_code, 201, created.text)

        emp_token = self._login(EMPLOYEE_EMAIL)
        types = self.client.get("/api/leave/types", headers=self._auth(emp_token))
        self.assertEqual(types.status_code, 200)
        lop = next(item for item in types.json() if item["code"] == "LOP")
        applied = self.client.post(
            "/api/leave/apply",
            json={
                "leave_type_id": lop["id"],
                "from_date": "2027-01-08",
                "to_date": "2027-01-12",
                "is_half_day": False,
                "reason": "Family travel covering weekend and holiday",
            },
            headers=self._auth(emp_token),
        )
        self.assertEqual(applied.status_code, 201, applied.text)
        self.assertEqual(float(applied.json()["total_days"]), 2.0)

        self.client.delete(f"/api/holidays/{created.json()['holiday_id']}", headers=self._auth(hr_token))

    def test_attendance_today_shows_holiday_without_check_in(self):
        hr_token = self._login(HR_EMAIL)
        today = date.today().isoformat()
        created = self.client.post(
            "/api/holidays",
            json={"holiday_date": today, "holiday_name": "Pulse Check Holiday", "holiday_type": "COMPANY"},
            headers=self._auth(hr_token),
        )
        if created.status_code == 400:
            listed = self.client.get("/api/holidays", params={"from_date": today, "to_date": today}, headers=self._auth(hr_token))
            holiday_id = listed.json()[0]["holiday_id"] if listed.json() else None
        else:
            self.assertEqual(created.status_code, 201, created.text)
            holiday_id = created.json()["holiday_id"]

        emp_token = self._login(EMPLOYEE_EMAIL)
        today_att = self.client.get("/api/attendance/today", headers=self._auth(emp_token))
        self.assertEqual(today_att.status_code, 200)
        self.assertEqual(today_att.json()["status"], "HOLIDAY")

        dashboard = self.client.get("/api/dashboard/me", headers=self._auth(emp_token))
        self.assertEqual(dashboard.status_code, 200)
        self.assertTrue(dashboard.json()["is_holiday_today"])
        self.assertTrue(dashboard.json()["upcoming_holidays"])

        if holiday_id and created.status_code == 201:
            self.client.delete(f"/api/holidays/{holiday_id}", headers=self._auth(hr_token))


if __name__ == "__main__":
    unittest.main()
