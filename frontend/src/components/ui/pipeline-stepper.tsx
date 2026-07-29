import { motion, type Variants } from "motion/react";
import type { ReactNode } from "react";

interface PipelineStep {
  label: string;
  icon?: ReactNode;
}

interface PipelineStepperProps {
  steps: PipelineStep[];
  currentStep: number;
}

export function PipelineStepper({ steps, currentStep }: PipelineStepperProps) {
  return (
    <div className="w-full py-4">
      <div className="flex items-center w-full">
        {steps.map((step, index) => {
          const stepNumber = index + 1;
          const status = currentStep > stepNumber ? "complete" : currentStep === stepNumber ? "active" : "inactive";
          return (
            <div key={index} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center gap-2">
                <StepCircle step={stepNumber} status={status} icon={step.icon} />
                <span
                  className={`text-[10px] font-medium text-center w-16 leading-tight ${
                    status === "inactive" ? "text-muted-foreground/50" : "text-foreground"
                  }`}
                >
                  {step.label}
                </span>
              </div>
              {index < steps.length - 1 && <StepConnector isComplete={currentStep > stepNumber} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StepCircle({ step, status, icon }: { step: number; status: string; icon?: ReactNode }) {
  return (
    <motion.div
      animate={status}
      initial={false}
      variants={
        {
          inactive: { scale: 1, backgroundColor: "var(--color-muted)", color: "var(--color-muted-foreground)" },
          active: { scale: 1.1, backgroundColor: "var(--color-primary)", color: "var(--color-primary-foreground)" },
          complete: { scale: 1, backgroundColor: "var(--color-primary)", color: "var(--color-primary-foreground)" },
        } as Variants
      }
      transition={{ duration: 0.3 }}
      className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold"
    >
      {status === "complete" ? <CheckIcon className="h-4 w-4" /> : icon || step}
    </motion.div>
  );
}

function StepConnector({ isComplete }: { isComplete: boolean }) {
  return (
    <div className="relative mx-1 h-0.5 flex-1 overflow-hidden rounded bg-muted self-start mt-4">
      <motion.div
        className="absolute left-0 top-0 h-full bg-primary"
        initial={false}
        animate={{ width: isComplete ? "100%" : "0%" }}
        transition={{ duration: 0.4 }}
      />
    </div>
  );
}

function CheckIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
      <motion.path
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ delay: 0.1, duration: 0.3 }}
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M5 13l4 4L19 7"
      />
    </svg>
  );
}
