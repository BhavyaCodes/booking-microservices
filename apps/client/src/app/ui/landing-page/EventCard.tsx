import {
  Card,
  CardContent,
  CardHeader,
  CardMedia,
  Typography,
} from "@mui/material";

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
  return (
    <Card>
      <CardMedia sx={{ height: 140 }} image={imageUrl ?? ""} title={title} />
      <CardHeader title={title} subheader={date} />
      <CardContent>
        <Typography variant="body1">{desc}</Typography>
      </CardContent>
    </Card>
  );
};
