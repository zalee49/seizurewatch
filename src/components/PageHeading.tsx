import Icon, { type IconName } from "@/components/Icon";

export default function PageHeading({ title, description, icon }: { title: string; description: string; icon: IconName }) {
  return (
    <div className="sw-page-heading">
      <span className="sw-heading-icon"><Icon name={icon} className="size-7" /></span>
      <div className="min-w-0">
        <h1 className="text-4xl font-bold">{title}</h1>
        <p className="sw-page-description mt-2 text-base text-muted">{description}</p>
      </div>
    </div>
  );
}
