import mongoose from "mongoose";
import { UserRoles } from "@booking/common/interfaces";

interface UserAttrs {
  email: string;
  picture?: string;
  role?: UserRoles;
}

interface UserDoc extends mongoose.Document {
  id: mongoose.Types.ObjectId;
  email: string;
  picture?: string;
  role: UserRoles;
}

interface UserModel extends mongoose.Model<UserDoc> {
  build(attrs: UserAttrs): UserDoc;
}

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true },
    picture: { type: String },
    role: {
      type: String,
      enum: Object.values(UserRoles),
      default: UserRoles.USER,
      required: true,
    },
  },
  {
    toJSON: {
      transform: (doc, ret: any) => {
        ret.id = ret._id;
        delete ret._id;
      },
    },
  },
);

userSchema.statics.build = (attrs: UserAttrs) => {
  return new User(attrs);
};

const User = mongoose.model<UserDoc, UserModel>("User", userSchema);

export { User, UserRoles };
