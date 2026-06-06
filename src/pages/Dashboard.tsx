import { Link } from "react-router-dom";
import { ArrowLeft, LayoutDashboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GmailWidget } from "@/components/widgets/GmailWidget";
import { CalendarWidget } from "@/components/widgets/CalendarWidget";
import { DriveWidget } from "@/components/widgets/DriveWidget";
import { YouTubeWidget } from "@/components/widgets/YouTubeWidget";
import { NewsWidget } from "@/components/widgets/NewsWidget";
import { TrendingVideosWidget } from "@/components/widgets/TrendingVideosWidget";
import { MapsWidget } from "@/components/widgets/MapsWidget";
import { WeatherWidget } from "@/components/widgets/WeatherWidget";
import { useEffect } from "react";

const Dashboard = () => {
  useEffect(() => {
    document.title = "SARVIS Dashboard — Gmail, Calendar, Drive, YouTube, News & Maps";
    let meta = document.querySelector('meta[name="description"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "description");
      document.head.appendChild(meta);
    }
    meta.setAttribute(
      "content",
      "Unified dashboard for your Gmail, Google Calendar, Drive, YouTube channel, top news headlines, and nearby places on an interactive map.",
    );
  }, []);

  return (
    <div className="min-h-[100dvh] w-full bg-background">
      <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border bg-background/85 px-4 py-3 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="icon" className="h-9 w-9">
            <Link to="/" aria-label="Back to chat">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <LayoutDashboard className="h-5 w-5 text-primary" />
          <h1 className="text-base sm:text-lg font-semibold text-foreground">Dashboard</h1>
        </div>
        <span className="text-xs tracking-widest text-primary/80 text-glow">SARVIS AI</span>
      </header>

      <main className="mx-auto w-full max-w-7xl p-3 sm:p-5">
        <div className="grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-2 xl:grid-cols-3">
          <YouTubeWidget />
          <CalendarWidget />
          <GmailWidget />
          <WeatherWidget />
          <DriveWidget />
          <NewsWidget />
          <div className="md:col-span-2 xl:col-span-1">
            <MapsWidget />
          </div>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
