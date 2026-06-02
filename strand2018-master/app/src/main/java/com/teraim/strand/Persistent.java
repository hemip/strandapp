package com.teraim.strand;

import java.io.FileInputStream;
import java.io.FileNotFoundException;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.ObjectInputStream;
import java.io.ObjectOutputStream;
import java.io.OptionalDataException;
import java.io.StreamCorruptedException;

import android.util.Log;

import com.teraim.strand.utils.Constants;

public class Persistent {
	
	public static void onSave (Provyta py) {
		
		Log.d("Strand","Save");
		// Write to disk with FileOutputStream
		FileOutputStream f_out=null;
		try {
			f_out = new 
				FileOutputStream(Constants.LOCAL_DATA_DIR +py.getpyID());
		} catch (FileNotFoundException e) {
			//Most likely get here if the folder is missing. Try this..
				e.printStackTrace();
			}

		// Write object with ObjectOutputStream
		ObjectOutputStream obj_out = null;
		try {
			obj_out = new
				ObjectOutputStream (f_out);
		} catch (IOException e) {
			// TODO Auto-generated catch block
			e.printStackTrace();
		}

		// Write object out to disk
		try {
			obj_out.writeObject ( py );
		} catch (IOException e) {
			// TODO Auto-generated catch block
			e.printStackTrace();
		}
		//set saved flag.
		py.setSaved(true);
	}

	public static Provyta onLoad (String pyID) {
		Log.d("Strand","Load");
		// Read from disk using FileInputStream
		FileInputStream f_in = null;
		try {
			f_in = new 
				FileInputStream(Constants.LOCAL_DATA_DIR +pyID);
		} catch (FileNotFoundException e) {
			//filenotfound occurs if object has not yet been persisted.
			Log.d("Strand","Kunde inte hitta provyta med pyID "+pyID);		
			return null;
		}

		// Read object using ObjectInputStream
		ObjectInputStream obj_in = null;
		try {
			obj_in = new ObjectInputStream (f_in);
		} catch (StreamCorruptedException e) {
			// TODO Auto-generated catch block
			e.printStackTrace();
		} catch (IOException e) {
			// TODO Auto-generated catch block
			e.printStackTrace();
		}

		// Read an object
		Object obj = null;
		try {
			obj = obj_in.readObject();
		} catch (OptionalDataException e) {
			// TODO Auto-generated catch block
			e.printStackTrace();
		} catch (ClassNotFoundException e) {
			// TODO Auto-generated catch block
			e.printStackTrace();
		} catch (IOException e) {
			// TODO Auto-generated catch block
			e.printStackTrace();
		} finally {
			try {
				obj_in.close();
			} catch (IOException e) {
				// TODO Auto-generated catch block
				e.printStackTrace();
			}
		}

	
		if (obj instanceof Provyta)
		{
			Provyta py = ((Provyta)obj);
			py.setSaved(true);
			return py;
			
		} else
			Log.e("Strand", "persisted object was not of type Provyta. Very strange indeed");
		
		return null;
	}
}
	
