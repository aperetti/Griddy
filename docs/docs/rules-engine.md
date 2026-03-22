---
sidebar_position: 4
---

# Display Rules Engine

The Display Rules Engine allows you to customize the visual representation of grid entities based on their CIM attributes. Using the Admin Console, you can define rules that change node colors, icons, sizes, and even inject custom CSS based on complex logical conditions.

## 1. Rule Assistant
The Rule Assistant is your primary tool for exploring entity attributes and building rules.

### Navigating Attributes
- **Select an Entity**: Click any node on the map to load its attributes into the Assistant.
- **MRID Navigation**: If an attribute value contains an MRID (e.g., `ConnectivityNode.Transformer`), a **"Dive" icon** will appear. Click it to navigate to that linked entity's attributes.
- **Breadcrumbs**: Use the breadcrumbs at the top of the Assistant to navigate back through your exploration history.

### Building Conditions
- **Context Menu**: Right-click (or long-press on mobile) any attribute row to open the context menu.
- **Quick Add**: Select an operator from the menu to automatically add a condition to the current rule:
  - `Exists`: Matches if the attribute is present.
  - `Not Exists`: Matches if the attribute is missing.
  - `== Value`: Matches if the attribute exactly equals the current value.
  - `!= Value`: Matches if the attribute does not equal the current value.
  - `Has more than one`: (For arrays/lists) Matches if the collection size > 1.

## 2. Advanced Rule Builder
The Rule Builder supports recursive nesting for complex logical requirements.

### Condition Groups
- **Logical Operators**: Toggle between **AND** and **OR** at any group level.
- **Nesting**: Use the **"Add Group"** button to create a nested set of conditions.
- **Target Class**: Optionally specify a target CIM class for the group to evaluate conditions against specific attached equipment.

### CSS Overrides
You can inject custom CSS snippets when specific conditions are met. This is useful for dynamic styling like highlighting overloaded transformers or coloring phases differently.

## 3. Best Practices
1. **Specificity**: Place more specific rules at the top (highest priority) and general defaults at the bottom.
2. **Efficiency**: Use `Exists` checks for high-level filtering before doing value comparisons.
3. **Exploration**: Use the MRID navigation to understand the relationships between assets before building rules that traverse the hierarchy.
