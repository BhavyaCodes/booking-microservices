import { format } from "date-fns";

import {
  Card,
  CardContent,
  CardHeader,
  CardMedia,
  Typography,
} from "@mui/material";
import Link from "next/link";

export const EventCard = ({
  date,
  desc,
  draft,
  id,
  imageUrl,
  title,
}: {
  date: string;
  desc: string;
  draft: boolean;
  id: string;
  imageUrl: string | null;
  title: string;
}) => {
  const formattedDate = format(date, "dd MMM yyyy");

  return (
    <Link
      style={{ textDecoration: "none", color: "inherit", cursor: "pointer" }}
      href={`/event/${id}`}
    >
      <Card>
        <CardMedia sx={{ height: 140 }} image={imageUrl ?? ""} title={title} />
        <CardHeader title={title} subheader={formattedDate} />
        <CardContent>
          <Typography variant="body1">{desc}</Typography>
        </CardContent>
      </Card>
    </Link>
  );
};
