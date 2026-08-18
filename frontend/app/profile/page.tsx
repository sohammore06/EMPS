"use client";

import { Protected } from "@/components/layout/protected";
import { EmployeeProfile } from "@/components/profile/employee-profile";

export default function ProfilePage() {
  return (
    <Protected>
      <EmployeeProfile />
    </Protected>
  );
}
