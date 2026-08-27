"use client";

import {
	InputGroup,
	InputGroupAddon,
	InputGroupButton,
	InputGroupInput,
} from "@doki/ui/components/input-group";
import { EyeIcon, EyeSlashIcon } from "@phosphor-icons/react";
import { useState } from "react";

export const INPUT_CLASS =
	"h-auto rounded-lg border border-transparent bg-[#1E1E1E] px-3 py-2.5 text-sm text-white placeholder:text-white/20 focus-visible:border-white/20 focus-visible:ring-0 dark:bg-[#1E1E1E]";

export default function PasswordInput({
	id,
	name,
	value,
	placeholder,
	onBlur,
	onChange,
}: {
	id: string;
	name: string;
	value: string;
	placeholder: string;
	onBlur: () => void;
	onChange: (value: string) => void;
}) {
	const [visible, setVisible] = useState(false);

	return (
		<InputGroup className="h-auto rounded-lg border-transparent bg-[#1E1E1E] has-[[data-slot=input-group-control]:focus-visible]:border-white/20 has-[[data-slot=input-group-control]:focus-visible]:ring-0 dark:bg-[#1E1E1E]">
			<InputGroupInput
				className="px-3 py-2.5 text-sm text-white placeholder:text-white/20"
				id={id}
				name={name}
				onBlur={onBlur}
				onChange={(event) => onChange(event.target.value)}
				placeholder={placeholder}
				type={visible ? "text" : "password"}
				value={value}
			/>
			<InputGroupAddon align="inline-end">
				<InputGroupButton
					aria-label={visible ? "Hide password" : "Show password"}
					className="text-white/30 hover:text-white/70"
					onClick={() => setVisible((current) => !current)}
					size="icon-xs"
					type="button"
					variant="ghost"
				>
					{visible ? <EyeIcon /> : <EyeSlashIcon />}
				</InputGroupButton>
			</InputGroupAddon>
		</InputGroup>
	);
}
