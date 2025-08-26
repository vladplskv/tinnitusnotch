import { cn } from "@/lib/utils";
import {
	ComponentProps,
	splitProps,
} from 'solid-js';

function Card(props: ComponentProps<"div">) {
	return (
		<div
			data-slot="card"
			{...props}
			class={cn(
				"bg-card text-card-foreground flex flex-col gap-6 rounded-xl border py-6 shadow-sm",
				props.class,
			)}
		/>
	)
}
function CardHeader(props: ComponentProps<"div">) {
	return (
		<div
			data-slot="card-header"
			{...props}
			class={cn(
				"@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-1.5 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6",
				props.class,
			)}
		/>
	)
}
function CardTitle(props: ComponentProps<"div">) {
	return (
		<div
			data-slot="card-title"
			{...props}
			class={cn("leading-none font-semibold", props.class)}
		/>
	)
}
function CardDescription(props: ComponentProps<"div">) {
	return (
		<div
			data-slot="card-description"
			{...props}
			class={cn("text-muted-foreground text-sm", props.class)}
		/>
	)
}
function CardAction(props: ComponentProps<"div">) {
	return (
		<div
			data-slot="card-action"
			{...props}
			class={cn(
				"col-start-2 row-span-2 row-start-1 self-start justify-self-end",
				props.class,
			)}
		/>
	)
}
function CardContent(props: ComponentProps<"div">) {
	return (
		<div
			data-slot="card-content"
			{...props}
			class={cn("px-6", props.class)}
		/>
	)
}
function CardFooter(props: ComponentProps<"div">) {
	return (
		<div
			data-slot="card-footer"
			{...props}
			class={cn("flex items-center px-6 [.border-t]:pt-6", props.class)}
		/>
	)
}
export {
	Card,
	CardHeader,
	CardFooter,
	CardTitle,
	CardAction,
	CardDescription,
	CardContent,
}
