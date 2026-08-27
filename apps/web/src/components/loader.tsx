import { SpinnerIcon } from "@phosphor-icons/react/dist/ssr";

export default function Loader() {
	return (
		<div className="flex h-full items-center justify-center pt-8">
			<SpinnerIcon className="animate-spin" size={24} />
		</div>
	);
}
