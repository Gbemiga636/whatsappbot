"use client";

import { DashboardShell } from "@/components/dashboard/shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import Link from "next/link";

export default function SettingsPage() {
  const { user, logout } = useAuth();

  return (
    <DashboardShell>
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Settings</h1>
          <p className="mt-1 text-sm text-gray-500">Profile and preferences</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
            <CardDescription>How you appear across Bygate</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" defaultValue={user?.firstName || ""} readOnly />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" defaultValue={user?.email || "—"} readOnly />
            </div>
            <div className="space-y-2">
              <Label>Account type</Label>
              <Input
                readOnly
                value={user?.mode === "guest" ? "Guest" : "Authenticated"}
              />
            </div>
            {user?.mode === "guest" && (
              <Button asChild>
                <Link href="/signup">Upgrade to full account</Link>
              </Button>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Danger zone</CardTitle>
            <CardDescription>Sign out of this browser</CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="danger"
              onClick={() => {
                logout();
                toast.success("Signed out");
                window.location.href = "/";
              }}
            >
              Log out
            </Button>
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}
