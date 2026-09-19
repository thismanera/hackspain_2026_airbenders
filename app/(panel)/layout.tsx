import { AppSidebar } from "@/components/grifo/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

export default function PanelLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="min-w-0">{children}</SidebarInset>
    </SidebarProvider>
  );
}
