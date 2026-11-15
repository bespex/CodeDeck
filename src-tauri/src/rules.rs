//! The rules every session gets when it starts (docs/KONZEPT.md 4.5): few, short, fixed, and
//! shown word for word in the Handover view, so the assistant gets nothing the user cannot see.
//! They live here, in one place, for both the hook that gives them and the view that shows them.
//! Always on (D17); how they reach a session is the adapter's business ([`crate::harness`]).

/// Exactly the text a session gets. The rule about `.workbench/` joins when CodeDeck creates and
/// shows that folder (step 2.1), not before: a rule must not point to something the user cannot see.
pub const START_RULES: &str = "\
Rules from CodeDeck, the app the user watches this project with. They are always the same and the user sees them there:
- When you publish a page somewhere else (a shared document, an artifact, a gist, a paste), say so in your answer and give its link.";
