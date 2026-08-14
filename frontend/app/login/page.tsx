"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth/auth-provider";
import { isMsalConfigured, loginRequest, msalInstance } from "@/lib/auth/msal";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";

const DEMO_ACCOUNTS = [
  {
    key: "employee",
    label: "Employee",
    email: "sohammore@intellifysolutions.com",
    description: "Attendance, leave, profile",
  },
  {
    key: "hr",
    label: "HR",
    email: "hr@intellifysolutions.com",
    description: "HR dashboard, approvals, reports",
  },
  {
    key: "superadmin",
    label: "Super Admin",
    email: "superadmin@intellifysolutions.com",
    description: "Full system access",
  },
] as const;

const DEMO_PASSWORD = "Password@123";

export default function LoginPage() {
  const { user, loading: authLoading, setSession, msalReady } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState(DEMO_PASSWORD);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && user) {
      router.replace("/dashboard");
    }
  }, [user, authLoading, router]);

  async function signIn(loginEmail: string, loginPassword: string) {
    setLoading(true);
    try {
      const { data } = await api.post("/api/auth/login", {
        email: loginEmail,
        password: loginPassword,
      });
      setSession(data.access_token, data.refresh_token, data.user);
      toast.success(`Welcome, ${data.user.name}`);
      router.replace("/dashboard");
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "Invalid credentials";
      toast.error(typeof message === "string" ? message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  async function localLogin(e: React.FormEvent) {
    e.preventDefault();
    await signIn(email, password);
  }

  async function microsoftLogin() {
    if (!isMsalConfigured || !msalReady) {
      toast.error("Microsoft login is not configured yet");
      return;
    }
    setLoading(true);
    try {
      await msalInstance.initialize();
      const result = await msalInstance.loginPopup(loginRequest);
      const idToken = result.idToken;
      if (!idToken) throw new Error("No ID token returned from Microsoft");
      const { data } = await api.post("/api/auth/microsoft", { id_token: idToken });
      setSession(data.access_token, data.refresh_token, data.user);
      toast.success(`Welcome, ${data.user.name}`);
      router.replace("/dashboard");
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { detail?: string } }; message?: string })?.response?.data
          ?.detail ||
        (err as Error)?.message ||
        "Microsoft sign-in failed";
      toast.error(typeof message === "string" ? message : "Microsoft sign-in failed");
    } finally {
      setLoading(false);
    }
  }

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Loading...
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center px-4 py-10">
      <div className="brand-gradient absolute inset-0 -z-10" />
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_20%_15%,rgba(255,255,255,0.18),transparent_40%)]" />
      <Card className="w-full max-w-lg border-white/30 bg-white shadow-card">
        <CardHeader className="space-y-3 text-center">
          <p className="text-3xl font-semibold tracking-tight text-brand">Intellify HRMS</p>
          <CardTitle className="text-xl">Choose how to sign in</CardTitle>
          <CardDescription>
            Pick a role to continue with local login. Microsoft SSO can be enabled later.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3">
            {DEMO_ACCOUNTS.map((account) => (
              <button
                key={account.key}
                type="button"
                disabled={loading}
                onClick={() => {
                  setSelected(account.key);
                  setEmail(account.email);
                  setPassword(DEMO_PASSWORD);
                  void signIn(account.email, DEMO_PASSWORD);
                }}
                className={`rounded-lg border p-4 text-left transition-all duration-200 hover:border-brand hover:bg-surface-muted ${
                  selected === account.key
                    ? "border-brand bg-surface-muted shadow-soft"
                    : "border-[var(--border-subtle)] bg-white"
                }`}
              >
                <p className="font-semibold text-foreground">{account.label}</p>
                <p className="text-sm text-muted-foreground">{account.description}</p>
                <p className="mt-1 text-xs font-medium text-brand">{account.email}</p>
              </button>
            ))}
          </div>

          <div className="relative py-1 text-center text-xs text-muted-foreground">
            <span className="bg-white px-2">or sign in manually</span>
          </div>

          <form onSubmit={localLogin} className="space-y-3 rounded-lg border border-[var(--border-subtle)] bg-surface-secondary p-4">
            <div className="space-y-1">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@intellifysolutions.com"
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Signing in..." : "Sign in"}
            </Button>
          </form>

          {isMsalConfigured && (
            <Button
              variant="outline"
              className="w-full"
              onClick={microsoftLogin}
              disabled={loading || !msalReady}
            >
              Continue with Microsoft
            </Button>
          )}

          <p className="text-center text-xs text-muted-foreground">
            Demo password for all roles: <span className="font-medium">Password@123</span>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
