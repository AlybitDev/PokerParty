import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { v4 as uuidv4 } from "uuid";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      name,
      startingMoney = 1000,
      smallBlind = 10,
      bigBlind = 20,
      minPlayers = 2,
      maxPlayers = 9,
      turnTimeout = 30,
    } = body;

    const party = await prisma.party.create({
      data: {
        uuid: uuidv4(),
        name: name || "Poker Night",
        startingMoney,
        smallBlind,
        bigBlind,
        minPlayers,
        maxPlayers,
        turnTimeout,
      },
    });

    return NextResponse.json({ party });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to create party" }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const uuid = searchParams.get("uuid");

  if (!uuid) {
    return NextResponse.json({ error: "UUID required" }, { status: 400 });
  }

  try {
    const party = await prisma.party.findUnique({
      where: { uuid },
      include: {
        players: {
          where: { isActive: true },
          orderBy: { order: "asc" },
        },
      },
    });

    if (!party) {
      return NextResponse.json({ error: "Party not found" }, { status: 404 });
    }

    return NextResponse.json({ party });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to get party" }, { status: 500 });
  }
}
