"use client";

import { Globe, Mail } from "lucide-react";

import { DomainSearch } from "@/components/domains/domain-search";
import { EmailDomains } from "@/components/domains/email-domains";
import { OwnedDomains } from "@/components/domains/owned-domains";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { EmailDomain, OwnedDomain } from "@/lib/domains/domains";

/**
 * Two jobs on one page, split rather than stacked: buying a domain and making
 * email work on it are separate errands, weeks apart, and neither wants to
 * scroll past the other.
 */
export function DomainsTabs({
  domains,
  emailDomains,
}: {
  domains: OwnedDomain[];
  emailDomains: EmailDomain[];
}) {
  return (
    <Tabs defaultValue="domains" className="min-w-0 gap-4">
      <TabsList>
        <TabsTrigger value="domains">
          <Globe />
          Domains
        </TabsTrigger>
        <TabsTrigger value="email">
          <Mail />
          Email domains
        </TabsTrigger>
      </TabsList>

      <TabsContent value="domains" className="flex min-w-0 flex-col gap-6">
        <section className="flex min-w-0 flex-col gap-3">
          <h2 className="text-sm font-semibold tracking-tight">Your domains</h2>
          <OwnedDomains domains={domains} />
        </section>

        <section className="flex min-w-0 flex-col gap-3">
          <div>
            <h2 className="text-sm font-semibold tracking-tight">
              Find a domain
            </h2>
            <p className="text-muted-foreground text-xs">
              Registered in your name, not the app&apos;s. You can move it out
              at any time.
            </p>
          </div>
          <DomainSearch />
        </section>
      </TabsContent>

      <TabsContent value="email">
        <EmailDomains domains={emailDomains} />
      </TabsContent>
    </Tabs>
  );
}
