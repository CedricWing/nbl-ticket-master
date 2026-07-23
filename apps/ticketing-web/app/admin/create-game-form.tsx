'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ApiError, createGame, type Team } from '@/lib/api-client';

const createGameSchema = z
  .object({
    homeTeamId: z.string().min(1, 'Required'),
    awayTeamId: z.string().min(1, 'Required'),
    startsAt: z.string().min(1, 'Required'),
  })
  .refine((v) => v.homeTeamId !== v.awayTeamId, {
    message: 'Home and away teams must differ',
    path: ['awayTeamId'],
  });

type CreateGameValues = z.infer<typeof createGameSchema>;

export function CreateGameForm({
  teams,
  teamsError,
  onCreated,
}: {
  teams: Team[];
  teamsError: boolean;
  onCreated: () => void;
}) {
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<CreateGameValues>({
    resolver: zodResolver(createGameSchema),
    defaultValues: { homeTeamId: '', awayTeamId: '', startsAt: '' },
  });

  async function onSubmit(values: CreateGameValues) {
    setFormError(null);
    try {
      await createGame({
        homeTeamId: values.homeTeamId,
        awayTeamId: values.awayTeamId,
        startsAt: new Date(values.startsAt).toISOString(),
      });
      form.reset();
      onCreated();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Failed to create game');
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create game</CardTitle>
      </CardHeader>
      <CardContent>
        {teamsError && (
          <p role="alert" className="text-destructive mb-3 text-xs">
            Failed to load teams — reload the page to try again.
          </p>
        )}
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
            <FormField
              control={form.control}
              name="homeTeamId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Home team</FormLabel>
                  <FormControl>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select home team" />
                      </SelectTrigger>
                      <SelectContent>
                        {teams.map((team) => (
                          <SelectItem key={team.id} value={team.id}>
                            {team.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="awayTeamId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Away team</FormLabel>
                  <FormControl>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select away team" />
                      </SelectTrigger>
                      <SelectContent>
                        {teams.map((team) => (
                          <SelectItem key={team.id} value={team.id}>
                            {team.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="startsAt"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Starts at</FormLabel>
                  <FormControl>
                    <Input type="datetime-local" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {formError && (
              <p role="alert" className="text-destructive text-sm font-medium">
                {formError}
              </p>
            )}
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? 'Creating…' : 'Create game'}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
