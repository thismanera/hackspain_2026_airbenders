import * as React from "react";

import { cn } from "@/lib/core/utils";

interface Visual1Props {
  mainColor?: string;
  secondaryColor?: string;
  gridColor?: string;
  direction?: "up" | "down";
  delayMs?: number;
}

export function Visual1({
  mainColor = "#0F1331",
  secondaryColor = "#3b4675",
  gridColor = "rgba(128, 128, 128, 0.08)",
  direction = "up",
  delayMs = 0,
}: Visual1Props) {
  const isDown = direction === "down";
  const id = React.useId();

  return (
    <div aria-hidden className="relative size-full overflow-hidden">
      <Layer1
        color={mainColor}
        secondaryColor={secondaryColor}
        isDown={isDown}
        delayMs={delayMs}
      />
      <Layer2
        color={mainColor}
        isDown={isDown}
        clipId={`clip-${id}`}
        delayMs={delayMs}
      />
      <EllipseGradient color={mainColor} gradId={`grad-${id}`} />
      <GridLayer color={gridColor} />
    </div>
  );
}

interface GridLayerProps {
  color: string;
}

const GridLayer = ({ color }: GridLayerProps) => {
  return (
    <div
      style={{ "--grid-color": color } as React.CSSProperties}
      className="pointer-events-none absolute inset-0 z-[4] size-full bg-transparent bg-[linear-gradient(to_right,var(--grid-color)_1px,transparent_1px),linear-gradient(to_bottom,var(--grid-color)_1px,transparent_1px)] [mask-image:radial-gradient(ellipse_50%_50%_at_50%_50%,#000_60%,transparent_100%)] bg-[size:16px_16px] bg-center opacity-60"
    />
  );
};

const EllipseGradient = ({ color, gradId }: { color: string; gradId: string }) => {
  return (
    <div className="pointer-events-none absolute inset-0 z-[5] flex size-full items-center justify-center">
      <svg className="size-full" viewBox="0 0 356 180" preserveAspectRatio="none" fill="none">
        <rect width="356" height="180" fill={`url(#${gradId})`} />
        <defs>
          <radialGradient
            id={gradId}
            cx="0"
            cy="0"
            r="1"
            gradientUnits="userSpaceOnUse"
            gradientTransform="translate(178 98) rotate(90) scale(98 178)"
          >
            <stop stopColor={color} stopOpacity="0.22" />
            <stop offset="0.45" stopColor={color} stopOpacity="0.08" />
            <stop offset="1" stopOpacity="0" />
          </radialGradient>
        </defs>
      </svg>
    </div>
  );
};

interface LayerProps {
  color: string;
  secondaryColor?: string;
  isDown?: boolean;
  delayMs?: number;
}

const Layer1 = ({
  color,
  secondaryColor = color,
  isDown,
  delayMs = 0,
}: LayerProps) => {
  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-0 z-[6] overflow-hidden",
        isDown && "-scale-x-100 origin-center"
      )}
    >
      <div
        style={{ animationDelay: `${delayMs}ms` }}
        className="visual-bars-loop absolute inset-y-0 left-0 w-[200%]"
      >
        <svg
          className="size-full"
          viewBox="0 0 712 180"
          preserveAspectRatio="none"
          fill="none"
        >
          <path d="M8 178C8 176.3 9.3 175 11 175H25C26.7 175 28 176.3 28 178V196H8V178Z" fill={color} />
          <path d="M32 168C32 166.3 33.3 165 35 165H49C50.7 165 52 166.3 52 168V196H32V168Z" fill={secondaryColor} />
          <path d="M67 173C67 171.3 68.3 170 70 170H84C85.7 170 87 171.3 87 173V196H67V173Z" fill={color} />
          <path d="M91 153C91 151.3 92.3 150 94 150H108C109.7 150 111 151.3 111 153V196H91V153Z" fill={secondaryColor} />
          <path d="M126 142C126 140.3 127.3 139 129 139H143C144.7 139 146 140.3 146 142V196H126V142Z" fill={color} />
          <path d="M150 158C150 156.3 151.3 155 153 155H167C168.7 155 170 156.3 170 158V196H150V158Z" fill={secondaryColor} />
          <path d="M187 133C187 131.3 188.3 130 190 130H204C205.7 130 207 131.3 207 133V196H187V133Z" fill={color} />
          <path d="M211 161C211 159.3 212.3 158 214 158H228C229.7 158 231 159.3 231 161V196H211V161Z" fill={secondaryColor} />
          <path d="M248 150C248 148.3 249.3 147 251 147H265C266.7 147 268 148.3 268 150V196H248V150Z" fill={color} />
          <path d="M272 130C272 128.3 273.3 127 275 127H289C290.7 127 292 128.3 292 130V196H272V130Z" fill={secondaryColor} />
          <path d="M307 133C307 131.3 308.3 130 310 130H324C325.7 130 327 131.3 327 133V196H307V133Z" fill={color} />
          <path d="M331 155C331 153.3 332.3 152 334 152H348C349.7 152 351 153.3 351 155V196H331V155Z" fill={secondaryColor} />
          <path d="M363 161C363 159.3 364.3 158 366 158H380C381.7 158 383 159.3 383 161V196H363V161Z" fill={color} />
          <path d="M387 144C387 142.3 388.3 141 390 141H404C405.7 141 407 142.3 407 144V196H387V144Z" fill={secondaryColor} />
          <path d="M423 126C423 124.3 424.3 123 426 123H440C441.7 123 443 124.3 443 126V196H423V126Z" fill={color} />
          <path d="M447 142C447 140.3 448.3 139 450 139H464C465.7 139 467 140.3 467 142V196H447V142Z" fill={secondaryColor} />
          <path d="M483 125.5C483 124.1 484.3 123 486 123H500C501.7 123 503 124.1 503 125.5V196H483V125.5Z" fill={color} />
          <path d="M507 137.5C507 136.1 508.3 135 510 135H524C525.7 135 527 136.1 527 137.5V196H507V137.5Z" fill={secondaryColor} />
          <path d="M543 108.2C543 106.4 544.3 105 546 105H560C561.7 105 563 106.4 563 108.2V196H543V108.2Z" fill={color} />
          <path d="M567 116.5C567 115.1 568.3 114 570 114H584C585.7 114 587 115.1 587 116.5V196H567V116.5Z" fill={secondaryColor} />
          <path d="M603 79.8C603 78.3 604.3 77 606 77H620C621.7 77 623 78.3 623 79.8V196H603V79.8Z" fill={color} />
          <path d="M627 91.9C627 90.3 628.3 89 630 89H644C645.7 89 647 90.3 647 91.9V196H627V91.9Z" fill={secondaryColor} />
          <path d="M661 66.8C661 65.2 662.3 64 664 64H678C679.7 64 681 65.2 681 66.8V196H661V66.8Z" fill={color} />
          <path d="M685 55.7C685 54.2 686.3 53 688 53H702C703.7 53 705 54.2 705 55.7V196H685V55.7Z" fill={secondaryColor} />
        </svg>
      </div>
    </div>
  );
};

const Layer2 = ({
  color,
  isDown,
  clipId,
  delayMs = 0,
}: {
  color: string;
  isDown?: boolean;
  clipId: string;
  delayMs?: number;
}) => {
  const pathUp =
    "M1 131.5L33.5 125.5L64 102.5L93.5 118.5L124.5 90L154 100.5L183.5 76L207.5 92L244.5 51L274.5 60.5L307.5 46L334.5 28.5L356.5 1";
  const fillUp =
    "M33.5 125.5L1 131.5V197H356.5V1L335 28.5L306.5 46L274.5 60.5L244.5 51L207.5 92L183.5 76L154 100.5L124.5 90L93.5 118.5L64 102.5L33.5 125.5Z";

  const pathDown =
    "M1 1L22.5 28.5L49.5 46L82.5 60.5L112.5 51L149.5 92L173.5 76L202.5 100.5L232.5 90L263.5 118.5L292.5 102.5L323.5 125.5L356.5 131.5";
  const fillDown =
    "M1 1L22.5 28.5L49.5 46L82.5 60.5L112.5 51L149.5 92L173.5 76L202.5 100.5L232.5 90L263.5 118.5L292.5 102.5L323.5 125.5L356.5 131.5V197H1V1Z";

  return (
    <div className="absolute inset-0 size-full overflow-hidden">
      <svg
        className="size-full"
        viewBox="0 0 356 180"
        preserveAspectRatio="none"
        fill="none"
      >
        <g clipPath={`url(#${clipId})`}>
          <path
            d={isDown ? pathDown : pathUp}
            stroke={color}
            strokeWidth={2.25}
            strokeLinecap="round"
          />
          <path
            d={isDown ? fillDown : fillUp}
            fill={color}
            fillOpacity="0.16"
          />
        </g>
        <defs>
          <clipPath id={clipId}>
            <rect width="356" height="180" fill="white" />
          </clipPath>
        </defs>
      </svg>
      <div
        style={{ animationDelay: `${delayMs}ms` }}
        className="visual-curtain-loop pointer-events-none absolute inset-0 z-[3] bg-gradient-to-r from-transparent from-0% to-card to-25%"
      />
    </div>
  );
};

