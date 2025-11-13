# shadcn-ui Setup and Usage Guide

This project uses [shadcn-ui](https://ui.shadcn.com/), a collection of reusable components built with Radix UI and Tailwind CSS.

## Overview

shadcn-ui is not a traditional npm package. Instead, you add component source code directly to your project, giving you full control over the components and allowing you to customize them as needed.

## Configuration

The shadcn-ui configuration is defined in `components.json`:

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "default",
  "rsc": true,
  "tsx": true,
  "tailwind": {
    "config": "tailwind.config.ts",
    "css": "app/globals.css",
    "baseColor": "slate",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  }
}
```

### Key Configuration Options

- **rsc**: `true` - Enables React Server Components support
- **tsx**: `true` - Uses TypeScript
- **baseColor**: `slate` - Primary color scheme
- **cssVariables**: `true` - Uses CSS variables for theming
- **aliases**: Path aliases for cleaner imports

## Project Structure

```
components/
├── ui/               # shadcn-ui components
│   ├── button.tsx    # Button component
│   ├── card.tsx      # Card component and subcomponents
│   └── input.tsx     # Input component
└── examples/         # Usage examples
    └── ShadcnExamples.tsx
```

## Available Components

### Button

A versatile button component with multiple variants and sizes.

**Variants:**

- `default` - Primary button style
- `destructive` - For destructive actions
- `outline` - Outlined button
- `secondary` - Secondary style
- `ghost` - Transparent background
- `link` - Link-styled button

**Sizes:**

- `sm` - Small
- `default` - Default size
- `lg` - Large
- `icon` - Icon-only button

**Example:**

```tsx
import { Button } from '@/components/ui/button';

<Button variant="default" size="lg">
  Click me
</Button>
```

### Card

A card container with optional header, content, description, and footer sections.

**Sub-components:**

- `Card` - Main container
- `CardHeader` - Header section
- `CardTitle` - Title heading
- `CardDescription` - Description text
- `CardContent` - Main content area
- `CardFooter` - Footer section

**Example:**

```tsx
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

<Card>
  <CardHeader>
    <CardTitle>Card Title</CardTitle>
    <CardDescription>Card description</CardDescription>
  </CardHeader>
  <CardContent>
    <p>Card content goes here</p>
  </CardContent>
  <CardFooter>
    <Button>Action</Button>
  </CardFooter>
</Card>
```

### Input

A styled input component supporting all standard HTML input types.

**Example:**

```tsx
import { Input } from '@/components/ui/input';

<Input
  type="email"
  placeholder="email@example.com"
  onChange={(e) => console.log(e.target.value)}
/>
```

## Utility Functions

### cn (Class Name Utility)

Located at `@/lib/utils/cn`, this utility combines `clsx` and `tailwind-merge` for conditional class application and conflict resolution.

**Example:**

```tsx
import { cn } from '@/lib/utils/cn';

<div className={cn(
  'base-class',
  isActive && 'active-class',
  'px-4' // This will override any conflicting padding classes
)}>
  Content
</div>
```

**How it works:**

- Uses `clsx` for conditional classes
- Uses `tailwind-merge` to handle Tailwind class conflicts
- Later classes override earlier ones when they target the same CSS property

## Adding New Components

To add additional shadcn-ui components to your project:

1. **Using the CLI (recommended):**

   ```bash
   npx shadcn-ui@latest add [component-name]
   ```

   Example:

   ```bash
   npx shadcn-ui@latest add dialog
   npx shadcn-ui@latest add dropdown-menu
   ```

2. **Manual Installation:**
   - Visit [shadcn-ui components](https://ui.shadcn.com/docs/components)
   - Copy the component code
   - Paste into `components/ui/[component-name].tsx`
   - Install any required dependencies

## Examples

See `components/examples/ShadcnExamples.tsx` for comprehensive usage examples including:

- All button variants and sizes
- Card layouts and compositions
- Input types and form integration
- Interactive component combinations

## Styling and Customization

### Tailwind Integration

All components use Tailwind CSS classes. You can customize them by:

1. **Passing className prop:**

   ```tsx
   <Button className="bg-blue-500 hover:bg-blue-600">
     Custom Button
   </Button>
   ```

2. **Modifying component source:**
   Since components are in your codebase, you can directly edit them in `components/ui/`

3. **Using CSS variables:**
   Modify colors and themes in `app/globals.css`

### Dark Mode

Components include dark mode styles using the `dark:` prefix. Dark mode support is built-in.

```tsx
// Automatically supports dark mode
<Card>
  <CardContent>
    This content styles differently in dark mode
  </CardContent>
</Card>
```

## Accessibility

All shadcn-ui components follow accessibility best practices:

- Semantic HTML elements
- ARIA attributes where needed
- Keyboard navigation support
- Focus management
- Screen reader friendly

**Example with accessibility features:**

```tsx
<Button size="icon">
  <span className="sr-only">Search</span>
  🔍
</Button>
```

## TypeScript Support

All components are fully typed with TypeScript:

```tsx
import { Button, type ButtonProps } from '@/components/ui/button';

// ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>
const MyButton: React.FC<ButtonProps> = (props) => {
  return <Button {...props} />;
};
```

## Form Integration

Components work seamlessly with form libraries like `react-hook-form`:

```tsx
import { useForm } from 'react-hook-form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

function LoginForm() {
  const { register, handleSubmit } = useForm();

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <Input {...register('email')} type="email" />
      <Button type="submit">Login</Button>
    </form>
  );
}
```

## Best Practices

1. **Use the cn utility** for conditional styling and class merging
2. **Extend, don't modify** base components when possible
3. **Maintain consistency** by using standard variants across your app
4. **Leverage composition** - combine components for complex UI
5. **Add accessibility** - always include labels and ARIA attributes
6. **Type everything** - take advantage of TypeScript support

## Resources

- [shadcn-ui Documentation](https://ui.shadcn.com/)
- [Component Examples](https://ui.shadcn.com/examples)
- [Radix UI Primitives](https://www.radix-ui.com/)
- [Tailwind CSS Documentation](https://tailwindcss.com/)

## Dependencies

```json
{
  "clsx": "^2.1.1",
  "tailwind-merge": "^3.4.0",
  "class-variance-authority": "^0.7.1"
}
```

## Troubleshooting

### Import Errors

If you see "Cannot find module" errors, check:

1. Path aliases are configured in `tsconfig.json`
2. Component file exists in the correct location
3. Dependencies are installed (`pnpm install`)

### Styling Issues

If styles aren't applying:

1. Ensure Tailwind CSS is properly configured
2. Check `app/globals.css` includes Tailwind directives
3. Verify the `cn` utility is imported and used correctly

### TypeScript Errors

For type errors:

1. Check component props match the defined interface
2. Install missing type definitions
3. Restart TypeScript server in VS Code
