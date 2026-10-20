import { detectColumns } from '@certdrop/shared';
import { toast } from 'sonner';
import { FileDrop } from '../../components/ui/FileDrop';
import { TableIcon } from '../../components/ui/icons';
import { SectionLabel } from '../../components/ui/SectionLabel';
import { useBatchDraft } from '../batch/draft';
import { EventDetailsForm } from './EventDetailsForm';
import { CsvError, readCsvFile } from './parseCsv';
import { ParticipantsReview } from './ParticipantsReview';

const SAMPLE_CSV =
  'name,email\nAna Lima,ana@example.com\nKenji Watanabe,kenji@example.com\nZoë Müller,zoe@example.com\n';

function SampleLink() {
  return (
    <a
      href={`data:text/csv;charset=utf-8,${encodeURIComponent(SAMPLE_CSV)}`}
      download="certdrop-sample.csv"
      className="rounded-sm text-[13px] text-accent-fg hover:underline"
    >
      Download a sample CSV
    </a>
  );
}

/** Step 3: who gets a certificate, and what the email says. */
export default function ParticipantsStep() {
  const { participants, setParticipants } = useBatchDraft();

  const handleFile = async (file: File) => {
    try {
      const { headers, rows } = await readCsvFile(file);
      setParticipants({
        fileName: file.name,
        headers,
        rows,
        mapping: detectColumns(headers),
        overrides: {},
        skipInvalid: false,
      });
    } catch (err) {
      toast.error(
        err instanceof CsvError
          ? err.message
          : 'We couldn’t read that file. Save it as “CSV UTF-8” from your spreadsheet and try again.',
      );
    }
  };

  return (
    <div className="space-y-10">
      <section aria-labelledby="participants-heading" className="space-y-4">
        <SectionLabel>
          <span id="participants-heading">Participants</span>
        </SectionLabel>
        {participants ? (
          <ParticipantsReview onReplace={(file) => void handleFile(file)} />
        ) : (
          <FileDrop
            title="Drop your participant list here"
            description="A CSV with a name column and an email column, up to 1,000 rows. Export it from Excel, Google Sheets or your form tool."
            accept=".csv,text/csv"
            icon={<TableIcon />}
            onFile={(file) => void handleFile(file)}
            footer={<SampleLink />}
          />
        )}
      </section>

      <section aria-labelledby="event-heading" className="space-y-4 border-t border-line pt-8">
        <SectionLabel>
          <span id="event-heading">Event details</span>
        </SectionLabel>
        <EventDetailsForm />
      </section>
    </div>
  );
}
