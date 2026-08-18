import unittest

from fastapi.testclient import TestClient

from app.main import app

EMPLOYEE_EMAIL = "sohammore@intellifysolutions.com"
HR_EMAIL = "hr@intellifysolutions.com"
SUPERADMIN_EMAIL = "superadmin@intellifysolutions.com"
PASSWORD = "Password@123"


class EmployeeProfileAccessTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def _login(self, email: str) -> dict[str, str]:
        response = self.client.post("/api/auth/login", json={"email": email, "password": PASSWORD})
        self.assertEqual(response.status_code, 200, response.text)
        return {"Authorization": f"Bearer {response.json()['access_token']}"}

    def _employee_from_directory(self, headers: dict[str, str]) -> dict:
        directory = self.client.get("/api/users/directory", headers=headers)
        self.assertEqual(directory.status_code, 200, directory.text)
        return next(item for item in directory.json() if item["email"] == EMPLOYEE_EMAIL)

    def test_hr_can_open_employee_profile(self):
        headers = self._login(HR_EMAIL)
        employee = self._employee_from_directory(headers)

        profile = self.client.get(f"/api/users/{employee['id']}", headers=headers)
        self.assertEqual(profile.status_code, 200, profile.text)
        self.assertEqual(profile.json()["email"], EMPLOYEE_EMAIL)
        self.assertEqual(profile.json()["employee_code"], employee["employee_code"])

        certs = self.client.get(f"/api/users/{employee['id']}/certifications", headers=headers)
        self.assertEqual(certs.status_code, 200, certs.text)
        self.assertIsInstance(certs.json(), list)

        skills = self.client.get(f"/api/users/{employee['id']}/skills", headers=headers)
        self.assertEqual(skills.status_code, 200, skills.text)
        self.assertIsInstance(skills.json(), list)

    def test_superadmin_can_open_employee_profile(self):
        headers = self._login(SUPERADMIN_EMAIL)
        employee = self._employee_from_directory(headers)
        profile = self.client.get(f"/api/users/{employee['id']}", headers=headers)
        self.assertEqual(profile.status_code, 200, profile.text)
        self.assertEqual(profile.json()["email"], EMPLOYEE_EMAIL)

    def test_employee_cannot_open_another_profile(self):
        employee_headers = self._login(EMPLOYEE_EMAIL)
        hr_headers = self._login(HR_EMAIL)
        directory = self.client.get("/api/users/directory", headers=hr_headers)
        self.assertEqual(directory.status_code, 200, directory.text)
        hr = next(item for item in directory.json() if item["email"] == HR_EMAIL)

        blocked = self.client.get(f"/api/users/{hr['id']}", headers=employee_headers)
        self.assertEqual(blocked.status_code, 403)

        own = self.client.get("/api/users/me", headers=employee_headers)
        self.assertEqual(own.status_code, 200, own.text)
        own_by_id = self.client.get(f"/api/users/{own.json()['id']}", headers=employee_headers)
        self.assertEqual(own_by_id.status_code, 200, own_by_id.text)
        self.assertEqual(own_by_id.json()["email"], EMPLOYEE_EMAIL)

    def test_unknown_employee_is_not_found(self):
        headers = self._login(HR_EMAIL)
        response = self.client.get("/api/users/not-a-real-employee", headers=headers)
        self.assertEqual(response.status_code, 404)


if __name__ == "__main__":
    unittest.main()
