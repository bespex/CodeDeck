import { Section } from "../blocks";

/**
 * What else came up that is not part of the project yet? Drafts, mock-ups, throwaway scripts and
 * pages published elsewhere. Nothing is collected yet; the view holds the place.
 */
export function WorkbenchView() {
  return (
    <div className="flex min-h-full flex-col">
      <Section title="Workbench">
        <p className="max-w-prose">
          Not built yet. Sessions like to leave drafts, mock-ups, scripts and test data outside the project, in
          temporary folders or as pages elsewhere. They will be listed here, to take into the project or to clear away.
        </p>
      </Section>
    </div>
  );
}
