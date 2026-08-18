"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Protected } from "@/components/layout/protected";
import { EmployeeProfile } from "@/components/profile/employee-profile";
import { useAuth } from "@/lib/auth/auth-provider";
import { hasAnyRole } from "@/lib/api";

export default function EmployeeProfilePage() {
  return (
    <Protected>
      <EmployeeProfileGate />
    </Protected>
  );
}

function EmployeeProfileGate() {
  const { user } = useAuth();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const canView = hasAnyRole(user, ["HR", "SUPERADMIN", "MANAGER"]);

  useEffect(() => {
    if (user && !canView) {
      router.replace("/dashboard");
    }
  }, [user, canView, router]);

  if (!canView || !params.id) {
    return <p className="text-sm text-muted-foreground">Opening employee profile...</p>;
  }

  return <EmployeeProfile userId={params.id} readOnly backHref="/admin/employees" />;
}
