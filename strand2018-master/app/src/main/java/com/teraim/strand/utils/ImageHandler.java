package com.teraim.strand.utils;

import java.io.File;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.DialogInterface;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Point;
import android.net.Uri;
import android.provider.MediaStore;
import android.support.v4.content.FileProvider;
import android.text.Layout;
import android.util.Log;
import android.view.Display;
import android.view.View;
import android.view.View.OnClickListener;
import android.widget.ImageButton;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.Toast;

import com.teraim.strand.Provyta;
import com.teraim.strand.R;
import com.teraim.strand.Strand;

public class ImageHandler {

	Activity c;
	Provyta py;

	public final static int TAKE_PICTURE = 133;
	private String currSaving=null;

	public ImageHandler(Activity c) {
		this.c=c;
		py = Strand.getCurrentProvyta(c.getBaseContext());

	}
	
	
	public void drawButton(ImageButton b, String name) {

		String imgPath = Constants.LOCAL_PICS_DIR + py.getpyID() + "_";
		final String imgFileName = imgPath + name + ".png";


		//Try to load pic from disk, if any.
		File file = new File(imgFileName);

		if (file.exists()) {
			addImageToImageView(b,imgFileName);
		}

		//To avoid memory issues, we need to figure out how big bitmap to allocate, approximately
		//Picture is in landscape & should be approx half the screen width, and 1/5th of the height.

		//First get the ration between h and w of the pic.
		final BitmapFactory.Options options = new BitmapFactory.Options();
		options.inJustDecodeBounds=true;
		BitmapFactory.decodeFile(imgFileName,options);

		//there is a picture..
		int realW = options.outWidth;
		int realH = options.outHeight;


		//check if file exists
		if (realW>0) {
			double ratio = realH/realW;
			//Height should not be higher than width.
			if (ratio >0) {
				Log.d("Strand", "picture is not landscape. its portrait..");
			}
			Log.d("Strand", "realW realH"+realW+" "+realH);

			//Find out screen size.
			Display display = c.getWindowManager().getDefaultDisplay();
			Point size = new Point();
			display.getSize(size);
			int sWidth = size.x;

			//Target width should be about half the screen width.

			double tWidth = sWidth/2;
			//height is then the ratio times this..
			int tHeight = (int) (tWidth*ratio);

			//use target values to calculate the correct inSampleSize
			options.inSampleSize = calculateInSampleSize(options, (int)tWidth, tHeight);

			Log.d("Strand"," Calculated insamplesize "+options.inSampleSize);
			//now create real bitmap using insampleSize

			options.inJustDecodeBounds = false;
			Bitmap bip = BitmapFactory.decodeFile(imgFileName,options);
			if (bip!=null) {
				b.setImageBitmap(bip);
			}

		}
		else {
			Log.d("Strand","Did not find picture "+imgFileName);
			//need to set the width equal to the height...

		}
	}


	public void addListener(ImageButton b, final String name) {
		b.setOnClickListener(new OnClickListener()
		{

			@Override
			public void onClick(View v)
			{
				Toast.makeText(c,
						"pic" + name + " selected",
						Toast.LENGTH_SHORT).show();

				Intent intent = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);

				File file = new File(Constants.LOCAL_PICS_DIR, py.getpyID()+"_"+name+".png");
				Log.d("Strand","Saving pic "+name);
				currSaving=name;

				Uri outputFileUri = FileProvider.getUriForFile(c,c.getApplicationContext().getPackageName()+".provider",file);
				intent.putExtra(MediaStore.EXTRA_OUTPUT, outputFileUri);
				c.startActivityForResult(intent, TAKE_PICTURE);


			}

		});


	}

	public String takeExtraPicture(){
		String name = py.getpyID()+"_Extra";
		int number = getNextExtraPictureNumber(name);
		String fileName = name+"_"+number+".png";
		File file = new File(Constants.LOCAL_PICS_DIR, fileName);

		Log.d("Strand","Saving extra picture");

		Intent intent = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
		Uri outputFileUri = FileProvider.getUriForFile(c,c.getApplicationContext().getPackageName()+".provider",file);
		intent.putExtra(MediaStore.EXTRA_OUTPUT, outputFileUri);
		c.startActivityForResult(intent, TAKE_PICTURE);

		return fileName;
	}

	private int getNextExtraPictureNumber(String name){
		int x =0;
		File dir = new File(Constants.LOCAL_PICS_DIR);
		File[] files = dir.listFiles();
		for (File file : files) {
			if (file.getName().startsWith(name) && file.getName().length()>5 ){
				int l = file.getName().length();
				int y  = Integer.parseInt( file.getName().substring(l-5,l-4));
				if (y>x) {x=y;}
			}
		}
		return x+1;
	}

	public void takeDeponiPicture(final String deponityp){
		String name = py.getpyID()+"_Deponi_"+deponityp;
		int number = getNextDeponiNumber(name);
		File file = new File(Constants.LOCAL_PICS_DIR, name+"_"+number+".png");
		Log.d("Strand","Saving deponipic "+deponityp);

		Intent intent = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
		Uri outputFileUri = FileProvider.getUriForFile(c,c.getApplicationContext().getPackageName()+".provider",file);
		intent.putExtra(MediaStore.EXTRA_OUTPUT, outputFileUri);
		c.startActivityForResult(intent, TAKE_PICTURE);
	}

	private int getNextDeponiNumber(String name){
		int x =0;
		File dir = new File(Constants.LOCAL_PICS_DIR);
		File[] files = dir.listFiles();
		for (File file : files) {
			if (file.getName().startsWith(name) && file.getName().length()>5 ){
				int l = file.getName().length();
				int y  = Integer.parseInt( file.getName().substring(l-5,l-4));
				if (y>x) {x=y;}
			}
		}

		return x+1;
	}


	public void addImageToImageView(ImageView image, String imgFileName){
		final BitmapFactory.Options options = new BitmapFactory.Options();
		options.inJustDecodeBounds=true;
		BitmapFactory.decodeFile(imgFileName,options);

		//there is a picture..
		int realW = options.outWidth;
		int realH = options.outHeight;

		//check if file exists
		if (realW>0) {
			double ratio = realW/realH;
			double tHeight = 800.0;
			//height is then the ratio times this..
			int tWidth = (int) (tHeight*ratio);

			//use target values to calculate the correct inSampleSize
			options.inSampleSize = calculateInSampleSize(options, tWidth, (int)tHeight);

			Log.d("Strand"," Calculated insamplesize "+options.inSampleSize);
			//now create real bitmap using insampleSize

			options.inJustDecodeBounds = false;
			Bitmap bip = BitmapFactory.decodeFile(imgFileName,options);
			if (bip!=null) {
				image.setImageBitmap(bip);
			}
		}
	}


	
	public String getCurrentlySaving() {
		return currSaving;
	}
	
	public static int calculateInSampleSize(
			BitmapFactory.Options options, int reqWidth, int reqHeight) {
		// Raw height and width of image
		final int height = options.outHeight;
		final int width = options.outWidth;
		int inSampleSize = 1;

		if (height > reqHeight || width > reqWidth) {

			// Calculate ratios of height and width to requested height and width
			final int heightRatio = Math.round((float) height / (float) reqHeight);
			final int widthRatio = Math.round((float) width / (float) reqWidth);

			// Choose the smallest ratio as inSampleSize value, this will guarantee
			// a final image with both dimensions larger than or equal to the
			// requested height and width.
			inSampleSize = heightRatio < widthRatio ? heightRatio : widthRatio;
		}

		return inSampleSize;
	}

}
