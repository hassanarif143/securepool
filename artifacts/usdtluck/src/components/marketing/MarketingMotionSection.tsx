import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import type { CSSProperties } from "react";

export function MarketingMotionSection({
  id,
  className,
  style,
  children,
}: {
  id?: string;
  className?: string;
  style?: CSSProperties;
  children: React.ReactNode;
}) {
  return (
    <motion.section
      id={id}
      style={style}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className={cn("scroll-mt-24", className)}
    >
      {children}
    </motion.section>
  );
}
