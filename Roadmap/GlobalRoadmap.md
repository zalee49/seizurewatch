# SeizureWatch: Global roadmap

A web page my partner and I share to keep track of our dog's epilepsy: his history, the
medications he's on, every seizure and what we did about it, and his bloodwork results.
It should be quick to fill in from a phone and easy to read at a glance, so we can spot
patterns and bring clear information to the vet.

> **Date:** 2026-11-04.
> **Status:** Draft. Describes what we want; execution plans for each version go in
> their own roadmap files in this folder.

---

## Who uses it and how

- **Two people, one shared record.** We both see and edit the same data. No accounts or
  login.
- **Mostly on a phone.** Adding a seizure has to be quick, even while it's happening.
- **Easy to read.** History, seizures and bloodwork should be visual and clear, not just
  lists of entries.
- **Online.** Hosted so we can both reach it from anywhere.

## Sections of the app

### 1. His history

A section we fill in and keep updated with his background: how and when the seizures
started, his diagnosis, past treatments, and anything else relevant.

### 2. Current medications

The medications he's on now: drug, dose and when it's given. We update it whenever the
vet changes something.

### 3. Seizure calendar

A calendar where we can easily add seizure activity when it happens, along with our
response: rescue meds given and anything else we did. The calendar should make it easy
to see how often seizures happen and when.

### 4. Bloodwork

A place to record his results each time his levels are drawn, so we can follow them over
time.

---

## Decisions

- **Adding a seizure: quick log first, details after** (2026-11-04). One big
  "Seizure now" button saves the time instantly and can time the seizure. Afterwards,
  either of us adds the details from the calendar: duration, type, severity, symptoms
  before and after, possible triggers, and our response (rescue meds, anything else).
  Each seizure in a cluster gets its own entry.
- **Medication changes are kept as dated history** (2026-11-04). Each change (new drug,
  dose change, stopped) is saved with an "effective from" date. The medications section
  shows what he's on now; the calendar marks the dates changes took effect, so seizure
  frequency and bloodwork can be read against them.
- **Bloodwork: any test, charted over time** (2026-11-04). Each draw has a date, the
  time it was drawn, and a list of results (test name, value, unit, normal range). Any
  test recorded more than once gets a trend chart with its normal range shaded. Attaching
  the lab report (photo or PDF) is deferred; it can be added later without changing
  existing records.
- **History: profile fields plus notes** (2026-11-04). Set fields for name, breed,
  birthday, weight, diagnosis, date of first seizure, vet and emergency vet contacts, and
  allergies, followed by a free-form background notes area.
- **No access protection** (2026-11-04). No login, passcode or secret link: anyone with
  the address can view and edit. Accepted because the data isn't sensitive; can be
  revisited if the site is ever found and misused.
- **One dog** (2026-11-04). A single profile and no dog picker. Supporting more dogs
  later is a one-time data migration.
- **Vet summary comes after version 1** (2026-11-04). Build and use the four sections
  first; design the summary once there's real data to see what belongs on it.

---

## Versions

- **Version 1:** the four sections above, deployed online. Execution plan to be written
  as its own roadmap in this folder.
- **Next:** a print-friendly vet summary (seizures over a chosen period, current meds and
  recent changes, latest bloodwork), saved as PDF or printed from the phone.
- **Later, if wanted:** attaching lab reports to bloodwork; access protection; more than
  one dog.
