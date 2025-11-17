'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';

/**
 * Example component demonstrating shadcn-ui component usage.
 * This includes Button, Card, and Input components with various configurations.
 */
export function ShadcnExamples() {
  const [inputValue, setInputValue] = useState('');

  return (
    <div className="container mx-auto space-y-8 p-8">
      {/* Button Examples */}
      <section className="space-y-4">
        <h2 className="text-3xl font-bold">Button Examples</h2>

        <Card>
          <CardHeader>
            <CardTitle>Button Variants</CardTitle>
            <CardDescription>
              Different button styles for various use cases
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-4">
            <Button variant="default">Default</Button>
            <Button variant="destructive">Destructive</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="link">Link</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Button Sizes</CardTitle>
            <CardDescription>
              Buttons come in different sizes to fit your layout
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-4">
            <Button size="sm">Small</Button>
            <Button size="default">Default</Button>
            <Button size="lg">Large</Button>
            <Button size="icon">
              <span className="sr-only">Icon</span>
              🔍
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Button States</CardTitle>
            <CardDescription>Disabled and loading states</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-4">
            <Button disabled>Disabled</Button>
            <Button
              disabled
              onClick={() => console.log('This should not fire')}
            >
              Disabled with onClick
            </Button>
          </CardContent>
        </Card>
      </section>

      {/* Card Examples */}
      <section className="space-y-4">
        <h2 className="text-3xl font-bold">Card Examples</h2>

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Simple Card</CardTitle>
              <CardDescription>
                A basic card with title and content
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p>
                This is the card content. It can contain any React elements.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Card with Footer</CardTitle>
              <CardDescription>
                A card that includes footer actions
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p>
                This card demonstrates the use of CardFooter for actions or
                additional information.
              </p>
            </CardContent>
            <CardFooter className="gap-2">
              <Button variant="outline">Cancel</Button>
              <Button>Confirm</Button>
            </CardFooter>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Interactive Card</CardTitle>
              <CardDescription>
                Cards can contain interactive elements
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="card-input" className="text-sm font-medium">
                  Enter your name
                </label>
                <Input
                  id="card-input"
                  placeholder="John Doe"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                />
              </div>
              {inputValue && (
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Hello, {inputValue}!
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Stylized Card</CardTitle>
              <CardDescription>Custom styling with Tailwind</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <p className="text-sm">
                  Cards can be customized with additional Tailwind classes.
                </p>
                <Button className="w-full" variant="secondary">
                  Full Width Button
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Input Examples */}
      <section className="space-y-4">
        <h2 className="text-3xl font-bold">Input Examples</h2>

        <Card>
          <CardHeader>
            <CardTitle>Input Types</CardTitle>
            <CardDescription>
              Various input types for different use cases
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="text-input" className="text-sm font-medium">
                Text Input
              </label>
              <Input id="text-input" type="text" placeholder="Enter text..." />
            </div>

            <div className="space-y-2">
              <label htmlFor="email-input" className="text-sm font-medium">
                Email Input
              </label>
              <Input
                id="email-input"
                type="email"
                placeholder="email@example.com"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="password-input" className="text-sm font-medium">
                Password Input
              </label>
              <Input
                id="password-input"
                type="password"
                placeholder="Enter password..."
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="number-input" className="text-sm font-medium">
                Number Input
              </label>
              <Input
                id="number-input"
                type="number"
                placeholder="Enter number..."
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="disabled-input" className="text-sm font-medium">
                Disabled Input
              </label>
              <Input
                id="disabled-input"
                type="text"
                placeholder="Disabled input"
                disabled
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Form Example</CardTitle>
            <CardDescription>
              A complete form using shadcn-ui components
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                alert('Form submitted!');
              }}
            >
              <div className="space-y-2">
                <label htmlFor="form-name" className="text-sm font-medium">
                  Name
                </label>
                <Input id="form-name" type="text" placeholder="Your name" />
              </div>

              <div className="space-y-2">
                <label htmlFor="form-email" className="text-sm font-medium">
                  Email
                </label>
                <Input
                  id="form-email"
                  type="email"
                  placeholder="your.email@example.com"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="form-message" className="text-sm font-medium">
                  Message
                </label>
                <Input
                  id="form-message"
                  type="text"
                  placeholder="Your message..."
                />
              </div>

              <div className="flex gap-2">
                <Button type="submit">Submit</Button>
                <Button type="button" variant="outline">
                  Clear
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
