"use client";

import {
  createContext,
  Dispatch,
  SetStateAction,
  useContext,
  useEffect,
  useState,
} from "react";
import { hcAuthClient } from "../lib/hc-client";
import { UserRoles } from "@booking/common/interfaces";

const UserContext = createContext<UserContextType | undefined>(undefined);

type UserContextType = {
  currentUser: {
    id: string;
    email: string;
    picture?: string;
    role: UserRoles;
  } | null;
  setCurrentUser: Dispatch<SetStateAction<UserContextType["currentUser"]>>;
};

export const useUser = () => {
  const user = useContext(UserContext);
  if (user === undefined) {
    throw new Error("useUser must be used within a UserProvider");
  }
  return user;
};

export const UserProvider = ({ children }: { children: React.ReactNode }) => {
  const [currentUser, setCurrentUser] =
    useState<UserContextType["currentUser"]>(null);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const response = await hcAuthClient.api.auth["current-user"].$get();
        if (response.ok) {
          const data = await response.json();

          setCurrentUser({
            email: data.currentUser.email,
            id: data.currentUser.id,
            picture: data.currentUser.picture,
            role: data.currentUser.role,
          });
        } else {
          setCurrentUser(null);
        }
      } catch (error) {
        console.error("Error fetching current user:", error);
        setCurrentUser(null);
      }
    };
    fetchUser();
  }, []);

  return (
    <UserContext.Provider
      value={{
        currentUser,
        setCurrentUser,
      }}
    >
      {children}
    </UserContext.Provider>
  );
};
