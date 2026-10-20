import { useEffect, useState } from "react";
import { MotionConfig } from "motion/react";

import { AnimatedGradientText } from "./components/magicui/animated-gradient-text";
import { AnimatedShinyText } from "./components/magicui/animated-shiny-text";
import { AnimatedThemeToggler } from "./components/magicui/animated-theme-toggler";
import { DotPattern } from "./components/magicui/dot-pattern";
import { KineticText } from "./components/magicui/kinetic-text";
import { Particles } from "./components/magicui/particles";
import { SparklesText } from "./components/magicui/sparkles-text";
import { TextAnimate } from "./components/magicui/text-animate";

type Theme = "light" | "dark";

export default function NotFound() {
  // Deterministic on the server and the first client render so the prerendered
  // markup hydrates cleanly; the stored theme is applied right after mount.
  const [theme, setTheme] = useState<Theme>("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (document.documentElement.classList.contains("dark")) setTheme("dark");
  }, []);

  const changeTheme = (next: Theme) => {
    setTheme(next);
    try {
      localStorage.setItem("glox_theme", next);
    } catch {
      /* private mode */
    }
  };

  return (
    <MotionConfig reducedMotion="user">
      <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-[#f3f3f8] px-6 py-28 text-foreground dark:bg-[#0a0a0a]">
        <DotPattern
          width={22}
          height={22}
          cr={1}
          className="text-black/[0.13] [mask-image:radial-gradient(ellipse_70%_60%_at_50%_45%,black,transparent)] dark:text-white/[0.13]"
        />
        {mounted && (
          <Particles
            className="cudic-particles absolute inset-0"
            quantity={70}
            staticity={60}
            ease={70}
            size={0.6}
            color={theme === "dark" ? "#ffffff" : "#111111"}
          />
        )}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-1/2 h-[55vmin] w-[80vmin] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#c9d5f0]/50 blur-[110px] dark:bg-[#20304d]/40"
        />

        <div className="fixed left-1/2 top-4 z-50 -translate-x-1/2 rounded-full border border-black/10 bg-white/70 p-1.5 shadow-[0_10px_40px_rgba(20,20,40,0.10)] backdrop-blur-md dark:border-white/10 dark:bg-black/40 dark:shadow-none">
          <AnimatedThemeToggler
            theme={theme}
            onThemeChange={changeTheme}
            duration={560}
            aria-label="Toggle light and dark theme"
            className="flex size-9 items-center justify-center rounded-full text-foreground transition-colors hover:bg-black/[0.06] dark:hover:bg-white/10 [&_svg]:size-4"
          />
        </div>

        <h1 className="sr-only">Page not found</h1>

        <div className="relative z-10 text-center">
          <SparklesText
            sparklesCount={16}
            colors={{ first: "#6FB7FF", second: "#FFC93C" }}
            className="text-[30vw] leading-[0.86] text-foreground md:text-[24vw]"
          >
            <KineticText
              as="span"
              text="404"
              className="justify-center font-display leading-[0.86]"
            />
          </SparklesText>

          <div className="mt-2">
            <AnimatedGradientText
              speed={0.8}
              colorFrom="var(--foreground)"
              colorTo="var(--muted-foreground)"
              className="font-display text-[clamp(30px,4.6vw,58px)] font-[300] leading-tight"
            >
              Page not found
            </AnimatedGradientText>
          </div>

          <AnimatedShinyText
            shimmerWidth={140}
            className="mx-auto mt-5 block max-w-xl text-[16px] leading-relaxed text-[#5f6673]/85 md:text-[17px] dark:text-[#b4b4bb]/85"
          >
            <TextAnimate
              as="span"
              by="word"
              animation="blurInUp"
              duration={0.7}
              delay={0.35}
              startOnView={false}
              className="whitespace-normal"
            >
              Sorry, Cudic couldn't find the page you were looking for.
            </TextAnimate>
          </AnimatedShinyText>

          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a
              href="/games"
              className="inline-flex h-12 items-center justify-center rounded-full bg-[#0a0a0a] px-7 text-[15px] font-bold text-white transition hover:-translate-y-0.5 hover:bg-black dark:bg-[#fafafa] dark:text-[#0a0a0a] dark:hover:bg-white"
            >
              Browse the gallery
            </a>
            <a
              href="/"
              className="inline-flex h-12 items-center justify-center rounded-full border border-black/10 bg-white px-7 text-[15px] font-bold text-[#0a0a0a] transition hover:-translate-y-0.5 hover:border-black/20 dark:border-white/15 dark:bg-[#171717] dark:text-[#fafafa] dark:hover:border-white/25"
            >
              Go home
            </a>
          </div>
        </div>
      </main>
    </MotionConfig>
  );
}
